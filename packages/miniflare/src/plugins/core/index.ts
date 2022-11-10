import { readFileSync } from "fs";
import fs from "fs/promises";
import { TextEncoder } from "util";
import { bold, yellow } from "kleur/colors";
import { Request, Response } from "undici";
import { z } from "zod";
import {
	Service,
	Worker_Binding,
	Worker_Module,
	kVoid,
	supportedCompatibilityDate,
} from "../../runtime";
import { Awaitable, JsonSchema, MiniflareCoreError } from "../../shared";
import { BINDING_SERVICE_LOOPBACK, Plugin } from "../shared";
import {
	ModuleDefinitionSchema,
	ModuleLocator,
	ModuleRuleSchema,
	STRING_SCRIPT_PATH,
	convertModuleDefinition,
} from "./modules";

const encoder = new TextEncoder();
const numericCompare = new Intl.Collator(undefined, { numeric: true }).compare;

// (request: Request) => Awaitable<Response>
export const ServiceFetch = z
	.function()
	.args(z.instanceof(Request))
	.returns(z.instanceof(Response).or(z.promise(z.instanceof(Response))));
export const CoreOptionsSchema = z.object({
	name: z.string().optional(),
	script: z.string().optional(),
	scriptPath: z.string().optional(),
	modules: z
		.union([
			// Automatically collect modules by parsing `script`/`scriptPath`...
			z.boolean(),
			// ...or manually define modules
			// (used by Wrangler which has its own module collection code)
			z.array(ModuleDefinitionSchema),
		])
		.optional(),
	modulesRules: z.array(ModuleRuleSchema).optional(),

	compatibilityDate: z.string().optional(),
	compatibilityFlags: z.string().array().optional(),

	bindings: z.record(JsonSchema).optional(),
	wasmBindings: z.record(z.string()).optional(),
	textBlobBindings: z.record(z.string()).optional(),
	dataBlobBindings: z.record(z.string()).optional(),
	// TODO: add support for workerd network/external/disk services here
	serviceBindings: z.record(z.union([z.string(), ServiceFetch])).optional(),
});

export const CoreSharedOptionsSchema = z.object({
	host: z.string().optional(),
	port: z.number().optional(),

	inspectorPort: z.number().optional(),
	verbose: z.boolean().optional(),

	// TODO: add back validation of cf object
	cf: z.union([z.boolean(), z.string(), z.record(z.any())]).optional(),

	liveReload: z.boolean().optional(),
});

export const CORE_PLUGIN_NAME = "core";

// Service looping back to Miniflare's Node.js process (for storage, etc)
export const SERVICE_LOOPBACK = `${CORE_PLUGIN_NAME}:loopback`;
// Service for HTTP socket entrypoint (for checking runtime ready, routing, etc)
export const SERVICE_ENTRY = `${CORE_PLUGIN_NAME}:entry`;
// Service prefix for all regular user workers
const SERVICE_USER_PREFIX = `${CORE_PLUGIN_NAME}:user`;
// Service prefix for custom fetch functions defined in `serviceBindings` option
const SERVICE_CUSTOM_PREFIX = `${CORE_PLUGIN_NAME}:custom`;

export function getUserServiceName(name = "") {
	return `${SERVICE_USER_PREFIX}:${name}`;
}

export const HEADER_PROBE = "MF-Probe";
export const HEADER_CUSTOM_SERVICE = "MF-Custom-Service";

const BINDING_JSON_VERSION = "MINIFLARE_VERSION";
const BINDING_SERVICE_USER = "MINIFLARE_USER";
const BINDING_TEXT_CUSTOM_SERVICE = "MINIFLARE_CUSTOM_SERVICE";
const BINDING_JSON_CF_BLOB = "CF_BLOB";
const BINDING_DATA_LIVE_RELOAD_SCRIPT = "MINIFLARE_LIVE_RELOAD_SCRIPT";

const LIVE_RELOAD_SCRIPT_TEMPLATE = (
	port: number
) => `<script defer type="application/javascript">
(function () {
  // Miniflare Live Reload
  var url = new URL("/core/reload", location.origin);
  url.protocol = url.protocol.replace("http", "ws");
  url.port = ${port};
  function reload() { location.reload(); }
  function connect(reconnected) {
    var ws = new WebSocket(url);
    if (reconnected) ws.onopen = reload;
    ws.onclose = function(e) {
      e.code === 1012 ? reload() : e.code === 1000 || e.code === 1001 || setTimeout(connect, 1000, true);
    }
  }
  connect();
})();
</script>`;

// TODO: is there a way of capturing the full stack trace somehow?
// Using `>=` for version check to handle multiple `setOptions` calls before
// reload complete.
export const SCRIPT_ENTRY = `async function handleEvent(event) {
  const request = new Request(event.request, {
    cf: ${BINDING_JSON_CF_BLOB}
  })

  const probe = event.request.headers.get("${HEADER_PROBE}");
  if (probe !== null) {
    const probeMin = parseInt(probe);
    const status = ${BINDING_JSON_VERSION} >= probeMin ? 204 : 412;
    return new Response(null, { status });
  }

  if (globalThis.${BINDING_SERVICE_USER} === undefined) {
    return new Response("No entrypoint worker found", { status: 404 });
  }
  try {
    const response = await ${BINDING_SERVICE_USER}.fetch(request);

    const liveReloadScript = globalThis.${BINDING_DATA_LIVE_RELOAD_SCRIPT};
    if (
      liveReloadScript !== undefined &&
      response.headers.get("content-type")?.toLowerCase().includes("text/html")
    ) {
      const headers = new Headers(response.headers);
      const contentLength = parseInt(headers.get("content-length"));
      if (!isNaN(contentLength)) {
        headers.set("content-length", contentLength + liveReloadScript.byteLength);
      }
      
      const { readable, writable } = new IdentityTransformStream();
      event.waitUntil((async () => {
        await response.body?.pipeTo(writable, { preventClose: true });
        const writer = writable.getWriter();
        await writer.write(liveReloadScript);
        await writer.close();
      })());

      return new Response(readable, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  } catch (e) {
    // TODO: return pretty-error page here
    return new Response(e.stack);
  }
}
addEventListener("fetch", (event) => {
  event.respondWith(handleEvent(event));
});
`;
export const SCRIPT_CUSTOM_SERVICE = `addEventListener("fetch", (event) => {
  const request = new Request(event.request);
  request.headers.set("${HEADER_CUSTOM_SERVICE}", ${BINDING_TEXT_CUSTOM_SERVICE});
  event.respondWith(${BINDING_SERVICE_LOOPBACK}.fetch(request));
})`;

const now = new Date();
const CURRENT_COMPATIBILITY_DATE = [
	now.getFullYear(),
	(now.getMonth() + 1).toString().padStart(2, "0"),
	now.getDate().toString().padStart(2, "0"),
].join("-");

const FALLBACK_COMPATIBILITY_DATE = "2000-01-01";

function validateCompatibilityDate(compatibilityDate: string) {
	if (numericCompare(compatibilityDate, CURRENT_COMPATIBILITY_DATE) > 0) {
		// If this compatibility date is in the future, throw
		throw new MiniflareCoreError(
			"ERR_FUTURE_COMPATIBILITY_DATE",
			`Compatibility date "${compatibilityDate}" is in the future and unsupported`
		);
	} else if (
		numericCompare(compatibilityDate, supportedCompatibilityDate) > 0
	) {
		// If this compatibility date is greater than the maximum supported
		// compatibility date of the runtime, but not in the future, warn,
		// and use the maximum supported date instead
		console.warn(
			yellow(
				[
					"The latest compatibility date supported by the installed Cloudflare Workers Runtime is ",
					bold(`"${supportedCompatibilityDate}"`),
					",\nbut you've requested ",
					bold(`"${compatibilityDate}"`),
					". Falling back to ",
					bold(`"${supportedCompatibilityDate}"`),
					"...",
				].join("")
			)
		);
		return supportedCompatibilityDate;
	}
	return compatibilityDate;
}

export const CORE_PLUGIN: Plugin<
	typeof CoreOptionsSchema,
	typeof CoreSharedOptionsSchema
> = {
	options: CoreOptionsSchema,
	sharedOptions: CoreSharedOptionsSchema,
	getBindings(options) {
		const bindings: Awaitable<Worker_Binding>[] = [];

		if (options.bindings !== undefined) {
			bindings.push(
				...Object.entries(options.bindings).map(([name, value]) => ({
					name,
					json: JSON.stringify(value),
				}))
			);
		}
		if (options.wasmBindings !== undefined) {
			bindings.push(
				...Object.entries(options.wasmBindings).map(([name, path]) =>
					fs.readFile(path).then((wasmModule) => ({ name, wasmModule }))
				)
			);
		}
		if (options.textBlobBindings !== undefined) {
			bindings.push(
				...Object.entries(options.textBlobBindings).map(([name, path]) =>
					fs.readFile(path, "utf8").then((text) => ({ name, text }))
				)
			);
		}
		if (options.dataBlobBindings !== undefined) {
			bindings.push(
				...Object.entries(options.dataBlobBindings).map(([name, path]) =>
					fs.readFile(path).then((data) => ({ name, data }))
				)
			);
		}
		if (options.serviceBindings !== undefined) {
			bindings.push(
				...Object.entries(options.serviceBindings).map(([name, service]) => ({
					name,
					service: {
						name:
							typeof service === "function"
								? `${SERVICE_CUSTOM_PREFIX}:${name}` // Custom `fetch` function
								: `${SERVICE_USER_PREFIX}:${service}`, // Regular user worker
					},
				}))
			);
		}

		return Promise.all(bindings);
	},
	async getServices({
		options,
		optionsVersion,
		workerBindings,
		workerIndex,
		sharedOptions,
		durableObjectClassNames,
		additionalModules,
		loopbackPort,
	}) {
		// Define core/shared services.
		// Services get de-duped by name, so only the first worker's
		// SERVICE_LOOPBACK and SERVICE_ENTRY will be used
		const serviceEntryBindings: Worker_Binding[] = [
			{ name: BINDING_JSON_VERSION, json: optionsVersion.toString() },
			{ name: BINDING_JSON_CF_BLOB, json: JSON.stringify(sharedOptions.cf) },
		];
		if (sharedOptions.liveReload) {
			const liveReloadScript = LIVE_RELOAD_SCRIPT_TEMPLATE(loopbackPort);
			serviceEntryBindings.push({
				name: BINDING_DATA_LIVE_RELOAD_SCRIPT,
				data: encoder.encode(liveReloadScript),
			});
		}
		const services: Service[] = [
			{ name: SERVICE_LOOPBACK, external: { http: {} } },
			{
				name: SERVICE_ENTRY,
				worker: {
					serviceWorkerScript: SCRIPT_ENTRY,
					compatibilityDate: "2022-09-01",
					bindings: serviceEntryBindings,
				},
			},
		];

		// Define regular user worker if script is set
		const workerScript = getWorkerScript(options);
		if (workerScript !== undefined) {
			// Add additional modules (e.g. "__STATIC_CONTENT_MANIFEST") if any
			if ("modules" in workerScript) {
				workerScript.modules.push(...additionalModules);
			}

			const name = getUserServiceName(options.name);
			const classNames = durableObjectClassNames.get(name) ?? [];
			const compatibilityDate = validateCompatibilityDate(
				options.compatibilityDate ?? FALLBACK_COMPATIBILITY_DATE
			);

			services.push({
				name,
				worker: {
					...workerScript,
					compatibilityDate,
					compatibilityFlags: options.compatibilityFlags,
					bindings: workerBindings,
					durableObjectNamespaces: classNames.map((className) => ({
						className,
						uniqueKey: className,
					})),
					durableObjectStorage: { inMemory: kVoid },
					cacheApiOutbound: { name: "cache" },
				},
			});
			serviceEntryBindings.push({
				name: BINDING_SERVICE_USER,
				service: { name },
			});
		}

		// Define custom `fetch` services if set
		if (options.serviceBindings !== undefined) {
			for (const [name, service] of Object.entries(options.serviceBindings)) {
				if (typeof service === "function") {
					services.push({
						name: `${SERVICE_CUSTOM_PREFIX}:${name}`,
						worker: {
							serviceWorkerScript: SCRIPT_CUSTOM_SERVICE,
							compatibilityDate: "2022-09-01",
							bindings: [
								{
									name: BINDING_TEXT_CUSTOM_SERVICE,
									text: `${workerIndex}/${name}`,
								},
								{
									name: BINDING_SERVICE_LOOPBACK,
									service: { name: SERVICE_LOOPBACK },
								},
							],
						},
					});
				}
			}
		}

		return services;
	},
};

function getWorkerScript(
	options: z.infer<typeof CoreOptionsSchema>
): { serviceWorkerScript: string } | { modules: Worker_Module[] } | undefined {
	if (Array.isArray(options.modules)) {
		// If `modules` is a manually defined modules array, use that
		return { modules: options.modules.map(convertModuleDefinition) };
	}

	// Otherwise get code, preferring string `script` over `scriptPath`
	let code;
	if (options.script !== undefined) {
		code = options.script;
	} else if (options.scriptPath !== undefined) {
		code = readFileSync(options.scriptPath, "utf8");
	} else {
		// If neither `script`, `scriptPath` nor `modules` is defined, this worker
		// doesn't have any code
		return;
	}

	if (options.modules) {
		// If `modules` is `true`, automatically collect modules...
		const locator = new ModuleLocator(options.modulesRules);
		// If `script` and `scriptPath` are set, resolve modules in `script`
		// against `scriptPath`.
		locator.visitEntrypoint(code, options.scriptPath ?? STRING_SCRIPT_PATH);
		return { modules: locator.modules };
	} else {
		// ...otherwise, `modules` will either be `false` or `undefined`, so treat
		// `code` as a service worker
		return { serviceWorkerScript: code };
	}
}
