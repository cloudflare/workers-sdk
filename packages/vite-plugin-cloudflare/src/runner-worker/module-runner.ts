import { DurableObject } from "cloudflare:workers";
import { ModuleRunner, ssrModuleExportsKey } from "vite/module-runner";
import { INIT_PATH, UNKNOWN_HOST, VIRTUAL_WORKER_ENTRY } from "../shared";
import { stripInternalEnv } from "./env";
import type { WrapperEnv } from "./env";
import type {
	EvaluatedModuleNode,
	ModuleEvaluator,
	ModuleRunnerOptions,
} from "vite/module-runner";

/**
 * Custom `ModuleRunner`.
 * The `cachedModule` method is overriden to ensure compatibility with the Workers runtime.
 */
// @ts-expect-error: `cachedModule` is private
class CustomModuleRunner extends ModuleRunner {
	#env: WrapperEnv;

	constructor(
		options: ModuleRunnerOptions,
		evaluator: ModuleEvaluator,
		env: WrapperEnv
	) {
		super(options, evaluator);
		this.#env = env;
	}
	override async cachedModule(
		url: string,
		importer?: string
	): Promise<EvaluatedModuleNode> {
		const stub = this.#env.__VITE_RUNNER_OBJECT__.get("singleton");
		const moduleId = await stub.getFetchedModuleId(url, importer);
		const module = this.evaluatedModules.getModuleById(moduleId);

		if (!module) {
			throw new Error(`Module "${moduleId}" is undefined`);
		}

		return module;
	}
}

/** Module runner instance */
let moduleRunner: CustomModuleRunner | undefined;

/**
 * Durable Object that creates the module runner and handles WebSocket communication with the Vite dev server.
 */
export class __VITE_RUNNER_OBJECT__ extends DurableObject<WrapperEnv> {
	/** WebSocket connection to the Vite dev server */
	#webSocket?: WebSocket;
	#concurrentModuleNodePromises = new Map<
		string,
		Promise<EvaluatedModuleNode>
	>();

	/**
	 * Handles fetch requests to initialize the module runner.
	 * Creates a WebSocket pair for communication with the Vite dev server and initializes the ModuleRunner.
	 * @param request - The incoming fetch request
	 * @returns Response with WebSocket
	 * @throws Error if the path is invalid or the module runner is already initialized
	 */
	override async fetch(request: Request) {
		const { pathname } = new URL(request.url);

		if (pathname !== INIT_PATH) {
			throw new Error(
				`__VITE_RUNNER_OBJECT__ received invalid pathname: ${pathname}`
			);
		}

		if (moduleRunner) {
			throw new Error(`Module runner already initialized`);
		}

		const { 0: client, 1: server } = new WebSocketPair();
		server.accept();
		this.#webSocket = server;
		moduleRunner = await createModuleRunner(this.env, this.#webSocket);

		return new Response(null, { status: 101, webSocket: client });
	}
	/**
	 * Sends data to the Vite dev server via the WebSocket.
	 * @param data - The data to send as a string
	 * @throws Error if the WebSocket is not initialized
	 */
	send(data: string): void {
		if (!this.#webSocket) {
			throw new Error(`Module runner WebSocket not initialized`);
		}

		this.#webSocket.send(data);
	}
	/**
	 * Based on the implementation of `cachedModule` from Vite's `ModuleRunner`.
	 * Running this in the DO enables us to share promises across invocations.
	 * @param url - The module URL
	 * @param importer - The module's importer
	 * @returns The ID of the fetched module
	 */
	async getFetchedModuleId(
		url: string,
		importer: string | undefined
	): Promise<string> {
		if (!moduleRunner) {
			throw new Error(`Module runner not initialized`);
		}

		let cached = this.#concurrentModuleNodePromises.get(url);

		if (!cached) {
			const cachedModule = moduleRunner.evaluatedModules.getModuleByUrl(url);
			cached = moduleRunner
				// @ts-expect-error: `getModuleInformation` is private
				.getModuleInformation(url, importer, cachedModule)
				.finally(() => {
					this.#concurrentModuleNodePromises.delete(url);
				}) as Promise<EvaluatedModuleNode>;
			this.#concurrentModuleNodePromises.set(url, cached);
		} else {
			// @ts-expect-error: `debug` is private
			moduleRunner.debug?.("[module runner] using cached module info for", url);
		}

		const module = await cached;

		return module.id;
	}
}

/**
 * Creates a new module runner instance with a WebSocket transport.
 * @param env - The wrapper env
 * @param webSocket - WebSocket connection for communication with Vite dev server
 * @returns Configured module runner instance
 */
async function createModuleRunner(env: WrapperEnv, webSocket: WebSocket) {
	return new CustomModuleRunner(
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
					stub.send(JSON.stringify(data));
				},
				async invoke(data) {
					const response = await env.__VITE_INVOKE_MODULE__.fetch(
						new Request(UNKNOWN_HOST, {
							method: "POST",
							body: JSON.stringify(data),
						})
					);
					const result = await response.json();

					return result as { result: any } | { error: any };
				},
			},
			hmr: true,
		},
		{
			async runInlinedModule(context, transformed, module) {
				const code = `"use strict";async (${Object.keys(context).join(",")})=>{${transformed}}`;

				try {
					const fn = env.__VITE_UNSAFE_EVAL__.eval(code, module.id);
					await fn(...Object.values(context));
					Object.seal(context[ssrModuleExportsKey]);
				} catch (error) {
					if (error instanceof Error) {
						error.message = `Error running module "${module.url}".\n${error.message}.`;
					}

					throw error;
				}
			},
			async runExternalModule(filepath) {
				if (filepath === "cloudflare:workers") {
					const originalCloudflareWorkersModule = await import(
						"cloudflare:workers"
					);

					return Object.seal({
						...originalCloudflareWorkersModule,
						env: stripInternalEnv(
							originalCloudflareWorkersModule.env as WrapperEnv
						),
					});
				}

				return import(filepath);
			},
		},
		env
	);
}

/**
 * Retrieves a specific export from a Worker entry module using the module runner.
 * @param workerEntryPath - Path to the Worker entry module
 * @param exportName - Name of the export to retrieve
 * @returns The requested export value
 * @throws Error if the module runner has not been initialized or the module does not define the requested export
 */
export async function getWorkerEntryExport(
	workerEntryPath: string,
	exportName: string
): Promise<unknown> {
	if (!moduleRunner) {
		throw new Error(`Module runner not initialized`);
	}

	const module = await moduleRunner.import(VIRTUAL_WORKER_ENTRY);
	const exportValue =
		typeof module === "object" &&
		module !== null &&
		exportName in module &&
		module[exportName];

	if (!exportValue) {
		throw new Error(
			`"${workerEntryPath}" does not define a "${exportName}" export.`
		);
	}

	return exportValue;
}
