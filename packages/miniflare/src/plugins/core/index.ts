import fs from "fs/promises";
import { Request, Response } from "undici";
import { z } from "zod";
import { Awaitable, JsonSchema } from "../../helpers";
import { Service, Worker, Worker_Binding } from "../../runtime";
import { BINDING_SERVICE_LOOPBACK, Plugin } from "../shared";

// (request: Request) => Awaitable<Response>
export const ServiceFetch = z
	.function()
	.args(z.instanceof(Request))
	.returns(z.instanceof(Response).or(z.promise(z.instanceof(Response))));

export const CoreOptionsSchema = z.object({
	name: z.string().optional(),
	script: z.string().optional(),
	scriptPath: z.string().optional(),
	modules: z.boolean().optional(),
	compatibilityDate: z.string().optional(),
	compatibilityFlags: z.string().array().optional(),

	bindings: z.record(JsonSchema).optional(),
	wasmBindings: z.record(z.string()).optional(),
	textBlobBindings: z.record(z.string()).optional(),
	dataBlobBindings: z.record(z.string()).optional(),
	serviceBindings: z.record(z.union([z.string(), ServiceFetch])).optional(),
});
export const CoreSharedOptionsSchema = z.object({
	host: z.string().optional(),
	port: z.number().optional(),
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

export const HEADER_PROBE = "MF-Probe";
export const HEADER_CUSTOM_SERVICE = "MF-Custom-Service";

const BINDING_JSON_VERSION = "MINIFLARE_VERSION";
const BINDING_SERVICE_USER = "MINIFLARE_USER";
const BINDING_TEXT_CUSTOM_SERVICE = "MINIFLARE_CUSTOM_SERVICE";

// TODO: is there a way of capturing the full stack trace somehow?
// Using `>=` for version check to handle multiple `setOptions` calls before
// reload complete.
export const SCRIPT_ENTRY = `addEventListener("fetch", (event) => {
  const probe = event.request.headers.get("${HEADER_PROBE}");
  if (probe !== null) {
    const probeMin = parseInt(probe);
    const status = ${BINDING_JSON_VERSION} >= probeMin ? 204 : 412;
    return event.respondWith(new Response(null, { status }));
  }

  if (globalThis.${BINDING_SERVICE_USER} !== undefined) {
    event.respondWith(${BINDING_SERVICE_USER}.fetch(event.request).catch((err) => new Response(err.stack)));
  } else {
    event.respondWith(new Response("No script! 😠", { status: 404 }));
  }
});`;
export const SCRIPT_CUSTOM_SERVICE = `addEventListener("fetch", (event) => {
  const request = new Request(event.request);
  request.headers.set("${HEADER_CUSTOM_SERVICE}", ${BINDING_TEXT_CUSTOM_SERVICE});
  event.respondWith(${BINDING_SERVICE_LOOPBACK}.fetch(request));
})`;

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
								: `${SERVICE_USER_PREFIX}:${name}`, // Regular user worker
					},
				}))
			);
		}

		return Promise.all(bindings);
	},
	async getServices({ options, optionsVersion, workerBindings, workerIndex }) {
		// Define core/shared services.
		// Services get de-duped by name, so only the first worker's
		// SERVICE_LOOPBACK and SERVICE_ENTRY will be used
		const serviceEntryBindings: Worker_Binding[] = [
			{ name: BINDING_JSON_VERSION, json: optionsVersion.toString() },
		];
		const services: Service[] = [
			{ name: SERVICE_LOOPBACK, external: { http: {} } },
			{
				name: SERVICE_ENTRY,
				worker: {
					serviceWorkerScript: SCRIPT_ENTRY,
					bindings: serviceEntryBindings,
				},
			},
		];

		// Define regular user worker if script is set
		let workerScript: Partial<Worker> | undefined;
		if (options.script !== undefined) {
			workerScript = options.modules
				? { modules: [{ name: "<script>", esModule: options.script }] }
				: { serviceWorkerScript: options.script };
		} else if (options.scriptPath !== undefined) {
			if (options.modules) {
				// TODO: collect modules
			} else {
				const script = await fs.readFile(options.scriptPath, "utf8");
				workerScript = { serviceWorkerScript: script };
			}
		}

		if (workerScript !== undefined) {
			const name = `${SERVICE_USER_PREFIX}:${options.name ?? ""}`;
			services.push({
				name,
				worker: {
					...workerScript,
					compatibilityDate: options.compatibilityDate,
					compatibilityFlags: options.compatibilityFlags,
					bindings: workerBindings,
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
