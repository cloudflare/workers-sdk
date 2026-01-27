import { DurableObject } from "cloudflare:workers";
import { ModuleRunner, ssrModuleExportsKey } from "vite/module-runner";
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
import type {
	EvaluatedModuleNode,
	ModuleEvaluator,
	ModuleRunnerOptions,
} from "vite/module-runner";

declare global {
	// This global variable is accessed by `@vitejs/plugin-rsc`
	var __VITE_ENVIRONMENT_RUNNER_IMPORT__: (
		environmentName: string,
		id: string
	) => Promise<unknown>;
}

/**
 * Custom `ModuleRunner`.
 * The `cachedModule` method is overridden to ensure compatibility with the Workers runtime.
 */
// @ts-expect-error: `cachedModule` is private
class CustomModuleRunner extends ModuleRunner {
	#env: WrapperEnv;
	#environmentName: string;

	constructor(
		options: ModuleRunnerOptions,
		evaluator: ModuleEvaluator,
		env: WrapperEnv,
		environmentName: string
	) {
		super(options, evaluator);
		this.#env = env;
		this.#environmentName = environmentName;
	}
	override async cachedModule(
		url: string,
		importer?: string
	): Promise<EvaluatedModuleNode> {
		const stub = this.#env.__VITE_RUNNER_OBJECT__.get("singleton");
		const moduleId = await stub.getFetchedModuleId(
			this.#environmentName,
			url,
			importer
		);
		const module = this.evaluatedModules.getModuleById(moduleId);

		if (!module) {
			throw new Error(`Module "${moduleId}" is undefined`);
		}

		return module;
	}
}

/** Module runner instances keyed by environment name */
const moduleRunners = new Map<string, CustomModuleRunner>();

/** The parent environment name (set explicitly via IS_PARENT_ENVIRONMENT_HEADER) */
let parentEnvironmentName: string | undefined;

interface EnvironmentState {
	webSocket: WebSocket;
	concurrentModuleNodePromises: Map<string, Promise<EvaluatedModuleNode>>;
}

/**
 * Durable Object that creates the module runner and handles WebSocket communication with the Vite dev server.
 */
export class __VITE_RUNNER_OBJECT__ extends DurableObject<WrapperEnv> {
	/** Per-environment state containing WebSocket and concurrent module node promises */
	#environments = new Map<string, EnvironmentState>();

	/**
	 * Handles fetch requests to initialize a module runner for an environment.
	 * Creates a WebSocket pair for communication with the Vite dev server and initializes the ModuleRunner.
	 * @param request - The incoming fetch request
	 * @returns Response with WebSocket
	 * @throws Error if the path is invalid or the module runner is already initialized
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
		}

		const { 0: client, 1: server } = new WebSocketPair();
		server.accept();

		const environmentState: EnvironmentState = {
			webSocket: server,
			concurrentModuleNodePromises: new Map(),
		};
		this.#environments.set(environmentName, environmentState);

		const moduleRunner = await createModuleRunner(
			this.env,
			environmentState.webSocket,
			environmentName
		);
		moduleRunners.set(environmentName, moduleRunner);

		return new Response(null, { status: 101, webSocket: client });
	}
	/**
	 * Sends data to the Vite dev server via the WebSocket for a specific environment.
	 * @param environmentName - The environment name
	 * @param data - The data to send as a string
	 * @throws Error if the WebSocket is not initialized
	 */
	send(environmentName: string, data: string): void {
		const environmentState = this.#environments.get(environmentName);

		if (!environmentState) {
			throw new Error(
				`Module runner WebSocket not initialized for environment: "${environmentName}"`
			);
		}

		environmentState.webSocket.send(data);
	}
	/**
	 * Based on the implementation of `cachedModule` from Vite's `ModuleRunner`.
	 * Running this in the DO enables us to share promises across invocations.
	 * @param environmentName - The environment name
	 * @param url - The module URL
	 * @param importer - The module's importer
	 * @returns The ID of the fetched module
	 */
	async getFetchedModuleId(
		environmentName: string,
		url: string,
		importer: string | undefined
	): Promise<string> {
		const moduleRunner = moduleRunners.get(environmentName);

		if (!moduleRunner) {
			throw new Error(
				`Module runner not initialized for environment: "${environmentName}"`
			);
		}

		const environmentState = this.#environments.get(environmentName);
		if (!environmentState) {
			throw new Error(
				`Environment state not found for environment: "${environmentName}"`
			);
		}

		let cached = environmentState.concurrentModuleNodePromises.get(url);

		if (!cached) {
			const cachedModule = moduleRunner.evaluatedModules.getModuleByUrl(url);
			cached = moduleRunner
				// @ts-expect-error: `getModuleInformation` is private
				.getModuleInformation(url, importer, cachedModule)
				.finally(() => {
					environmentState.concurrentModuleNodePromises.delete(url);
				}) as Promise<EvaluatedModuleNode>;
			environmentState.concurrentModuleNodePromises.set(url, cached);
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
 * @param environmentName - The name of the environment this runner is for
 * @returns Configured module runner instance
 */
async function createModuleRunner(
	env: WrapperEnv,
	webSocket: WebSocket,
	environmentName: string
) {
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
				const code = `"use strict";async (${Object.keys(context).join(",")})=>{${transformed}}`;
				const fn = env.__VITE_UNSAFE_EVAL__.eval(code, module.id);
				await fn(...Object.values(context));
				Object.seal(context[ssrModuleExportsKey]);
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
		env,
		environmentName
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
	if (!parentEnvironmentName) {
		throw new Error(`Parent environment not initialized`);
	}

	const moduleRunner = moduleRunners.get(parentEnvironmentName);

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

export async function getWorkerEntryExportTypes() {
	if (!parentEnvironmentName) {
		throw new Error(`Parent environment not initialized`);
	}

	const moduleRunner = moduleRunners.get(parentEnvironmentName);

	if (!moduleRunner) {
		throw new Error(`Module runner not initialized`);
	}

	const { getExportTypes } = await moduleRunner.import(VIRTUAL_EXPORT_TYPES);
	const module = await moduleRunner.import(VIRTUAL_WORKER_ENTRY);

	return getExportTypes(module);
}

/**
 * Imports a module from a specific environment's module runner.
 * @param environmentName - The name of the environment to import from
 * @param id - The module ID to import
 * @returns The imported module
 * @throws Error if the environment's module runner has not been initialized
 */
async function importFromEnvironment(
	environmentName: string,
	id: string
): Promise<unknown> {
	const moduleRunner = moduleRunners.get(environmentName);

	if (!moduleRunner) {
		throw new Error(
			`Module runner not initialized for environment: "${environmentName}". Do you need to set \`childEnvironments: ["${environmentName}"]\` in the plugin config?`
		);
	}

	return moduleRunner.import(id);
}

// Register the import function globally for use from worker code
globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__ = importFromEnvironment;
