import { DurableObject } from "cloudflare:workers";
import {
	ModuleRunner,
	ssrDynamicImportKey,
	ssrModuleExportsKey,
} from "vite/module-runner";
import {
	ENVIRONMENT_NAME_HEADER,
	INIT_PATH,
	IS_PARENT_ENVIRONMENT_HEADER,
	UNKNOWN_HOST,
	VIRTUAL_EXPORT_TYPES,
	VIRTUAL_WORKER_ENTRY,
} from "../../shared";
import { stripInternalEnv } from "./env";
import type { WrapperEnv } from "./env";

declare global {
	// This global variable is accessed by `@vitejs/plugin-rsc`
	var __VITE_ENVIRONMENT_RUNNER_IMPORT__: (
		environmentName: string,
		id: string
	) => Promise<unknown>;
}

/** Module runner instances keyed by environment name */
const moduleRunners = new Map<string, ModuleRunner>();

/** The parent environment name (set explicitly via IS_PARENT_ENVIRONMENT_HEADER) */
let parentEnvironmentName: string | undefined;

let nextCallbackId = 0;
const pendingCallbacks = new Map<number, () => Promise<unknown>>();
const callbackResults = new Map<number, unknown>();

/**
 * Executes a callback in the runner Durable Object's IoContext via RPC + shared memory.
 * The callback function is stored in a module-scope map (shared with the DO
 * since both run in the same V8 isolate). Only a numeric ID crosses the RPC
 * boundary.
 */
async function runInRunnerObject(
	env: WrapperEnv,
	callback: () => Promise<unknown>
): Promise<unknown> {
	const id = nextCallbackId++;
	pendingCallbacks.set(id, callback);

	try {
		const stub = env.__VITE_RUNNER_OBJECT__.get("singleton");
		await stub.executeCallback(id);

		return callbackResults.get(id);
	} finally {
		pendingCallbacks.delete(id);
		callbackResults.delete(id);
	}
}

/**
 * Durable Object that provides an IoContext for module evaluation and handles
 * WebSocket communication with the Vite dev server.
 *
 * In workerd, a Durable Object has a single shared IoContext across all
 * incoming events, so promises are freely shareable within the DO without
 * cross-context issues.
 */
export class __VITE_RUNNER_OBJECT__ extends DurableObject<WrapperEnv> {
	/** Per-environment WebSockets */
	#webSockets = new Map<string, WebSocket>();

	/**
	 * Creates a WebSocket pair for communication with the Vite dev server and initializes the ModuleRunner.
	 */
	override async fetch(request: Request) {
		const { pathname } = new URL(request.url);

		if (pathname !== INIT_PATH) {
			throw new Error(
				`__VITE_RUNNER_OBJECT__ received invalid pathname: "${pathname}"`
			);
		}

		const environmentName = request.headers.get(ENVIRONMENT_NAME_HEADER);

		if (!environmentName) {
			throw new Error(
				`__VITE_RUNNER_OBJECT__ received request without "${ENVIRONMENT_NAME_HEADER}" header`
			);
		}

		if (moduleRunners.has(environmentName)) {
			throw new Error(
				`Module runner already initialized for environment: "${environmentName}"`
			);
		}

		const isParentEnvironment =
			request.headers.get(IS_PARENT_ENVIRONMENT_HEADER) === "true";

		if (isParentEnvironment) {
			parentEnvironmentName = environmentName;

			globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__ = async (
				envName: string,
				id: string
			): Promise<unknown> => {
				const runner = moduleRunners.get(envName);

				if (!runner) {
					throw new Error(
						`Module runner not initialized for environment: "${envName}". Do you need to set \`childEnvironments: ["${envName}"]\` in the plugin config?`
					);
				}

				return runInRunnerObject(this.env, () => runner.import(id));
			};
		}

		const { 0: client, 1: server } = new WebSocketPair();
		server.accept();

		const moduleRunner = await createModuleRunner(
			this.env,
			server,
			environmentName
		);

		moduleRunners.set(environmentName, moduleRunner);
		this.#webSockets.set(environmentName, server);

		return new Response(null, { status: 101, webSocket: client });
	}

	/**
	 * Sends data to the Vite dev server via the WebSocket for a specific environment.
	 */
	send(environmentName: string, data: string): void {
		const webSocket = this.#webSockets.get(environmentName);

		if (!webSocket) {
			throw new Error(
				`Module runner not initialized for environment: "${environmentName}"`
			);
		}

		webSocket.send(data);
	}

	/**
	 * Executes a callback stored in the module-scope `pendingCallbacks` map.
	 * The callback runs in the DO's IoContext, ensuring all promises created
	 * during execution belong to the DO's shared context.
	 */
	async executeCallback(id: number): Promise<void> {
		const callback = pendingCallbacks.get(id);

		if (!callback) {
			throw new Error(`No pending callback with id ${id}`);
		}

		const result = await callback();
		callbackResults.set(id, result);
	}
}

/**
 * Creates a new module runner instance with a WebSocket transport.
 * @param env - The wrapper env
 * @param webSocket - WebSocket connection for communication with Vite dev server
 * @param environmentName - The name of the environment this runner is for
 * @returns Configured module runner instance
 */
async function createModuleRunner(
	env: WrapperEnv,
	webSocket: WebSocket,
	environmentName: string
) {
	return new ModuleRunner(
		{
			sourcemapInterceptor: "prepareStackTrace",
			transport: {
				connect({ onMessage }) {
					webSocket.addEventListener("message", async ({ data }) => {
						onMessage(JSON.parse(data.toString()));
					});

					onMessage({
						type: "custom",
						event: "vite:ws:connect",
						data: { webSocket },
					});
				},
				disconnect() {
					webSocket.close();
				},
				send(data) {
					// We send messages via a binding to the Durable Object.
					// This is because `import.meta.send` may be called within a Worker's request context.
					// Directly using a WebSocket created in another context would be forbidden.
					const stub = env.__VITE_RUNNER_OBJECT__.get("singleton");
					stub.send(environmentName, JSON.stringify(data));
				},
				async invoke(data) {
					const response = await env.__VITE_INVOKE_MODULE__.fetch(
						new Request(UNKNOWN_HOST, {
							method: "POST",
							headers: {
								[ENVIRONMENT_NAME_HEADER]: environmentName,
							},
							body: JSON.stringify(data),
						})
					);
					const result = await response.json();

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return result as { result: any } | { error: any };
				},
			},
			hmr: true,
		},
		{
			async runInlinedModule(context, transformed, module) {
				// Wrap dynamic imports to route deferred dynamic imports
				// through the DO's IoContext.
				const originalDynamicImport = context[ssrDynamicImportKey];
				context[ssrDynamicImportKey] = (dep) => {
					return runInRunnerObject(env, () => originalDynamicImport(dep));
				};

				// The trailing newline ensures a `//` comment on the last line of
				// `transformed` (e.g. a sourceMappingURL comment preserved by
				// vite-plus) cannot swallow the closing brace.
				const code = `"use strict";async (${Object.keys(context).join(",")})=>{${transformed}\n}`;
				const fn = env.__VITE_UNSAFE_EVAL__.eval(code, module.id);
				await fn(...Object.values(context));
				Object.seal(context[ssrModuleExportsKey]);
			},
			async runExternalModule(filepath) {
				if (filepath === "cloudflare:workers") {
					const originalCloudflareWorkersModule =
						await import("cloudflare:workers");

					return Object.seal({
						...originalCloudflareWorkersModule,
						env: stripInternalEnv(
							originalCloudflareWorkersModule.env as WrapperEnv
						),
					});
				}

				return import(filepath);
			},
		}
	);
}

/**
 * Retrieves a specific export from a Worker entry module using the module runner.
 */
export async function getWorkerEntryExport(
	workerEntryPath: string,
	exportName: string
): Promise<unknown> {
	if (!parentEnvironmentName) {
		throw new Error(`Parent environment not initialized`);
	}

	const module = await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__(
		parentEnvironmentName,
		VIRTUAL_WORKER_ENTRY
	);

	const exportValue =
		typeof module === "object" &&
		module !== null &&
		exportName in module &&
		(module as Record<string, unknown>)[exportName];

	if (!exportValue) {
		throw new Error(
			`"${workerEntryPath}" does not define a "${exportName}" export.`
		);
	}

	return exportValue;
}

/**
 * Retrieves the export types of the Worker entry module.
 */
export async function getWorkerEntryExportTypes() {
	if (!parentEnvironmentName) {
		throw new Error(`Parent environment not initialized`);
	}

	const { getExportTypes } =
		(await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__(
			parentEnvironmentName,
			VIRTUAL_EXPORT_TYPES
		)) as { getExportTypes: (module: unknown) => unknown };

	const module = await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__(
		parentEnvironmentName,
		VIRTUAL_WORKER_ENTRY
	);

	return getExportTypes(module);
}
