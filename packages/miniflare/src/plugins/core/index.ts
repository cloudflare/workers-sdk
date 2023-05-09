import assert from "assert";
import { readFileSync } from "fs";
import fs from "fs/promises";
import { TextEncoder } from "util";
import { bold } from "kleur/colors";
import SCRIPT_ENTRY from "worker:core/entry";
import { z } from "zod";
import {
	Service,
	Worker_Binding,
	Worker_Module,
	supportedCompatibilityDate,
} from "../../runtime";
import {
	Awaitable,
	JsonSchema,
	Log,
	MiniflareCoreError,
	Timers,
} from "../../shared";
import { CoreBindings, CoreHeaders } from "../../workers";
import { getCacheServiceName } from "../cache";
import { DURABLE_OBJECTS_STORAGE_SERVICE_NAME } from "../do";
import {
	CloudflareFetchSchema,
	HEADER_CF_BLOB,
	Plugin,
	SERVICE_LOOPBACK,
	WORKER_BINDING_SERVICE_LOOPBACK,
	parseRoutes,
} from "../shared";
import {
	ModuleLocator,
	SourceOptions,
	SourceOptionsSchema,
	buildStringScriptPath,
	convertModuleDefinition,
} from "./modules";
import { ServiceDesignatorSchema } from "./services";

const encoder = new TextEncoder();
const numericCompare = new Intl.Collator(undefined, { numeric: true }).compare;

export const CoreOptionsSchema = z.intersection(
	SourceOptionsSchema,
	z.object({
		name: z.string().optional(),

		compatibilityDate: z.string().optional(),
		compatibilityFlags: z.string().array().optional(),

		routes: z.string().array().optional(),

		bindings: z.record(JsonSchema).optional(),
		wasmBindings: z.record(z.string()).optional(),
		textBlobBindings: z.record(z.string()).optional(),
		dataBlobBindings: z.record(z.string()).optional(),
		serviceBindings: z.record(ServiceDesignatorSchema).optional(),
	})
);

export const CoreSharedOptionsSchema = z.object({
	host: z.string().optional(),
	port: z.number().optional(),

	inspectorPort: z.number().optional(),
	verbose: z.boolean().optional(),

	log: z.instanceof(Log).optional(),
	timers: z.custom<Timers>().optional(),
	cloudflareFetch: CloudflareFetchSchema.optional(),

	// TODO: add back validation of cf object
	cf: z.union([z.boolean(), z.string(), z.record(z.any())]).optional(),

	liveReload: z.boolean().optional(),
});

export const CORE_PLUGIN_NAME = "core";

// Service for HTTP socket entrypoint (for checking runtime ready, routing, etc)
export const SERVICE_ENTRY = `${CORE_PLUGIN_NAME}:entry`;
// Service prefix for all regular user workers
const SERVICE_USER_PREFIX = `${CORE_PLUGIN_NAME}:user`;
// Service prefix for `workerd`'s builtin services (network, external, disk)
const SERVICE_BUILTIN_PREFIX = `${CORE_PLUGIN_NAME}:builtin`;
// Service prefix for custom fetch functions defined in `serviceBindings` option
const SERVICE_CUSTOM_PREFIX = `${CORE_PLUGIN_NAME}:custom`;

export function getUserServiceName(workerName = "") {
	return `${SERVICE_USER_PREFIX}:${workerName}`;
}
function getBuiltinServiceName(workerIndex: number, bindingName: string) {
	return `${SERVICE_BUILTIN_PREFIX}:${workerIndex}:${bindingName}`;
}
function getCustomServiceName(workerIndex: number, bindingName: string) {
	return `${SERVICE_CUSTOM_PREFIX}:${workerIndex}:${bindingName}`;
}

const LIVE_RELOAD_SCRIPT_TEMPLATE = (
	port: number
) => `<script defer type="application/javascript">
(function () {
  // Miniflare Live Reload
  var url = new URL("/cdn-cgi/mf/reload", location.origin);
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

export const SCRIPT_CUSTOM_SERVICE = `addEventListener("fetch", (event) => {
  const request = new Request(event.request);
  request.headers.set("${CoreHeaders.CUSTOM_SERVICE}", ${CoreBindings.TEXT_CUSTOM_SERVICE});
  request.headers.set("${CoreHeaders.ORIGINAL_URL}", request.url);
  event.respondWith(${CoreBindings.SERVICE_LOOPBACK}.fetch(request));
})`;

const FALLBACK_COMPATIBILITY_DATE = "2000-01-01";

function getCurrentCompatibilityDate() {
	// Get current compatibility date in UTC timezone
	const now = new Date().toISOString();
	return now.substring(0, now.indexOf("T"));
}

function validateCompatibilityDate(log: Log, compatibilityDate: string) {
	if (numericCompare(compatibilityDate, getCurrentCompatibilityDate()) > 0) {
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
		log.warn(
			[
				"The latest compatibility date supported by the installed Cloudflare Workers Runtime is ",
				bold(`"${supportedCompatibilityDate}"`),
				",\nbut you've requested ",
				bold(`"${compatibilityDate}"`),
				". Falling back to ",
				bold(`"${supportedCompatibilityDate}"`),
				"...",
			].join("")
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
	getBindings(options, workerIndex) {
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
				...Object.entries(options.serviceBindings).map(([name, service]) => {
					let serviceName: string;
					if (typeof service === "function") {
						// Custom `fetch` function
						serviceName = getCustomServiceName(workerIndex, name);
					} else if (typeof service === "object") {
						// Builtin workerd service: network, external, disk
						serviceName = getBuiltinServiceName(workerIndex, name);
					} else {
						// Regular user worker
						serviceName = getUserServiceName(service);
					}
					return {
						name: name,
						service: { name: serviceName },
					};
				})
			);
		}

		return Promise.all(bindings);
	},
	async getServices({
		log,
		options,
		workerBindings,
		workerIndex,
		durableObjectClassNames,
		additionalModules,
	}) {
		// Define regular user worker
		const workerScript = getWorkerScript(options, workerIndex);
		// Add additional modules (e.g. "__STATIC_CONTENT_MANIFEST") if any
		if ("modules" in workerScript) {
			workerScript.modules.push(...additionalModules);
		}

		const name = getUserServiceName(options.name);
		const classNames = Array.from(
			durableObjectClassNames.get(name) ?? new Set<string>()
		);
		const compatibilityDate = validateCompatibilityDate(
			log,
			options.compatibilityDate ?? FALLBACK_COMPATIBILITY_DATE
		);

		const services: Service[] = [
			{
				name,
				worker: {
					...workerScript,
					compatibilityDate,
					compatibilityFlags: options.compatibilityFlags,
					bindings: workerBindings,
					durableObjectNamespaces: classNames.map((className) => ({
						className,
						// This `uniqueKey` will (among other things) be used as part of the
						// path when persisting to the file-system. `-` is invalid in
						// JavaScript class names, but safe on filesystems (incl. Windows).
						uniqueKey: `${options.name ?? ""}-${className}`,
					})),
					durableObjectStorage:
						classNames.length === 0
							? undefined
							: { localDisk: DURABLE_OBJECTS_STORAGE_SERVICE_NAME },
					cacheApiOutbound: { name: getCacheServiceName(workerIndex) },
				},
			},
		];

		// Define custom `fetch` services if set
		if (options.serviceBindings !== undefined) {
			for (const [name, service] of Object.entries(options.serviceBindings)) {
				if (typeof service === "function") {
					// Custom `fetch` function
					services.push({
						name: getCustomServiceName(workerIndex, name),
						worker: {
							serviceWorkerScript: SCRIPT_CUSTOM_SERVICE,
							compatibilityDate: "2022-09-01",
							bindings: [
								{
									name: CoreBindings.TEXT_CUSTOM_SERVICE,
									text: `${workerIndex}/${name}`,
								},
								WORKER_BINDING_SERVICE_LOOPBACK,
							],
						},
					});
				} else if (typeof service === "object") {
					// Builtin workerd service: network, external, disk
					services.push({
						name: getBuiltinServiceName(workerIndex, name),
						...service,
					});
				}
			}
		}

		return services;
	},
};

export interface GlobalServicesOptions {
	optionsVersion: number;
	sharedOptions: z.infer<typeof CoreSharedOptionsSchema>;
	allWorkerRoutes: Map<string, string[]>;
	fallbackWorkerName: string | undefined;
	loopbackPort: number;
	log: Log;
}
export function getGlobalServices({
	optionsVersion,
	sharedOptions,
	allWorkerRoutes,
	fallbackWorkerName,
	loopbackPort,
	log,
}: GlobalServicesOptions): Service[] {
	// Collect list of workers we could route to, then parse and sort all routes
	const workerNames = [...allWorkerRoutes.keys()];
	const routes = parseRoutes(allWorkerRoutes);

	// Define core/shared services.
	const serviceEntryBindings: Worker_Binding[] = [
		WORKER_BINDING_SERVICE_LOOPBACK, // For converting stack-traces to pretty-error pages
		{ name: CoreBindings.JSON_VERSION, json: optionsVersion.toString() },
		{ name: CoreBindings.JSON_ROUTES, json: JSON.stringify(routes) },
		{ name: CoreBindings.JSON_CF_BLOB, json: JSON.stringify(sharedOptions.cf) },
		{ name: CoreBindings.JSON_LOG_LEVEL, json: JSON.stringify(log.level) },
		{
			name: CoreBindings.SERVICE_USER_FALLBACK,
			service: { name: getUserServiceName(fallbackWorkerName) },
		},
		...workerNames.map((name) => ({
			name: CoreBindings.SERVICE_USER_ROUTE_PREFIX + name,
			service: { name: getUserServiceName(name) },
		})),
	];
	if (sharedOptions.liveReload) {
		const liveReloadScript = LIVE_RELOAD_SCRIPT_TEMPLATE(loopbackPort);
		serviceEntryBindings.push({
			name: CoreBindings.DATA_LIVE_RELOAD_SCRIPT,
			data: encoder.encode(liveReloadScript),
		});
	}
	return [
		{
			name: SERVICE_LOOPBACK,
			external: { http: { cfBlobHeader: HEADER_CF_BLOB } },
		},
		{
			name: SERVICE_ENTRY,
			worker: {
				modules: [{ name: "entry.worker.js", esModule: SCRIPT_ENTRY }],
				compatibilityDate: "2023-04-04",
				bindings: serviceEntryBindings,
			},
		},
		// Allow access to private/public addresses:
		// https://github.com/cloudflare/miniflare/issues/412
		{
			name: "internet",
			network: {
				// Can't use `["public", "private"]` here because of
				// https://github.com/cloudflare/workerd/issues/62
				allow: ["0.0.0.0/0"],
				deny: [],
				tlsOptions: { trustBrowserCas: true },
			},
		},
	];
}

function getWorkerScript(
	options: SourceOptions,
	workerIndex: number
): { serviceWorkerScript: string } | { modules: Worker_Module[] } {
	if (Array.isArray(options.modules)) {
		// If `modules` is a manually defined modules array, use that
		const modulesRoot =
			("modulesRoot" in options ? options.modulesRoot : undefined) ?? "";
		return {
			modules: options.modules.map((module) =>
				convertModuleDefinition(modulesRoot, module)
			),
		};
	}

	// Otherwise get code, preferring string `script` over `scriptPath`
	let code;
	if ("script" in options && options.script !== undefined) {
		code = options.script;
	} else if ("scriptPath" in options && options.scriptPath !== undefined) {
		code = readFileSync(options.scriptPath, "utf8");
	} else {
		// If neither `script`, `scriptPath` nor `modules` is defined, this worker
		// doesn't have any code. `SourceOptionsSchema` should've validated against
		// this.
		assert.fail("Unreachable: Workers must have code");
	}

	if (options.modules) {
		// If `modules` is `true`, automatically collect modules...
		const locator = new ModuleLocator(options.modulesRules);
		// If `script` and `scriptPath` are set, resolve modules in `script`
		// against `scriptPath`.
		locator.visitEntrypoint(
			code,
			options.scriptPath ?? buildStringScriptPath(workerIndex)
		);
		return { modules: locator.modules };
	} else {
		// ...otherwise, `modules` will either be `false` or `undefined`, so treat
		// `code` as a service worker
		return { serviceWorkerScript: code };
	}
}

export * from "./errors";
export * from "./modules";
export * from "./services";
