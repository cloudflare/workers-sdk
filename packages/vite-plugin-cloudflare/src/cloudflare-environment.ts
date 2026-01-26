import assert from "node:assert";
import { CoreHeaders } from "miniflare";
import * as vite from "vite";
import { additionalModuleRE } from "./plugins/additional-modules";
import {
	ENVIRONMENT_NAME_HEADER,
	GET_EXPORT_TYPES_PATH,
	INIT_PATH,
	IS_ENTRY_WORKER_HEADER,
	IS_PARENT_ENVIRONMENT_HEADER,
	UNKNOWN_HOST,
	VIRTUAL_WORKER_ENTRY,
	WORKER_ENTRY_PATH_HEADER,
} from "./shared";
import { debuglog, getOutputDirectory, isRolldown } from "./utils";
import type { ExportTypes } from "./export-types";
import type {
	ResolvedWorkerConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type { MessageEvent, Miniflare, WebSocket } from "miniflare";
import type { FetchFunctionOptions } from "vite/module-runner";

export const MAIN_ENTRY_NAME = "index";

interface WebSocketContainer {
	webSocket?: WebSocket;
}

const webSocketUndefinedError = "The WebSocket is undefined";

function createHotChannel(
	webSocketContainer: WebSocketContainer
): vite.HotChannel {
	const listenersMap = new Map<string, Set<vite.HotChannelListener>>();

	const client: vite.HotChannelClient = {
		send(payload) {
			const webSocket = webSocketContainer.webSocket;
			assert(webSocket, webSocketUndefinedError);

			webSocket.send(JSON.stringify(payload));
		},
	};

	function onMessage(event: MessageEvent) {
		const payload = JSON.parse(event.data.toString()) as vite.CustomPayload;
		const listeners = listenersMap.get(payload.event) ?? new Set();

		for (const listener of listeners) {
			listener(payload.data, client);
		}
	}

	return {
		send(payload) {
			const webSocket = webSocketContainer.webSocket;
			assert(webSocket, webSocketUndefinedError);

			webSocket.send(JSON.stringify(payload));
		},
		on(event: string, listener: vite.HotChannelListener) {
			const listeners = listenersMap.get(event) ?? new Set();

			listeners.add(listener);
			listenersMap.set(event, listeners);
		},
		off(event: string, listener: vite.HotChannelListener) {
			listenersMap.get(event)?.delete(listener);
		},
		listen() {
			const webSocket = webSocketContainer.webSocket;
			assert(webSocket, webSocketUndefinedError);

			webSocket.addEventListener("message", onMessage);
		},
		close() {
			const webSocket = webSocketContainer.webSocket;
			assert(webSocket, webSocketUndefinedError);

			webSocket.removeEventListener("message", onMessage);
		},
	};
}

export class CloudflareDevEnvironment extends vite.DevEnvironment {
	#webSocketContainer: { webSocket?: WebSocket };

	constructor(name: string, config: vite.ResolvedConfig) {
		// It would be good if we could avoid passing this object around and mutating it
		const webSocketContainer = {};
		super(name, config, {
			hot: true,
			transport: createHotChannel(webSocketContainer),
		});
		this.#webSocketContainer = webSocketContainer;
	}

	async initRunner(
		miniflare: Miniflare,
		workerConfig: ResolvedWorkerConfig,
		options: { isEntryWorker: boolean; isParentEnvironment: boolean }
	): Promise<void> {
		const response = await miniflare.dispatchFetch(
			new URL(INIT_PATH, UNKNOWN_HOST),
			{
				headers: {
					[CoreHeaders.ROUTE_OVERRIDE]: workerConfig.name,
					[WORKER_ENTRY_PATH_HEADER]: encodeURIComponent(workerConfig.main),
					[IS_ENTRY_WORKER_HEADER]: String(options.isEntryWorker),
					[ENVIRONMENT_NAME_HEADER]: this.name,
					[IS_PARENT_ENVIRONMENT_HEADER]: String(options.isParentEnvironment),
					upgrade: "websocket",
				},
			}
		);
		assert(
			response.ok,
			`Failed to initialize module runner, error: ${await response.text()}`
		);
		const webSocket = response.webSocket;
		assert(webSocket, "Failed to establish WebSocket");
		webSocket.accept();
		this.#webSocketContainer.webSocket = webSocket;
	}

	async fetchWorkerExportTypes(
		miniflare: Miniflare,
		workerConfig: ResolvedWorkerConfig
	): Promise<ExportTypes> {
		// Wait for dependencies to be optimized before making the request
		await this.depsOptimizer?.init();

		const response = await miniflare.dispatchFetch(
			new URL(GET_EXPORT_TYPES_PATH, UNKNOWN_HOST),
			{
				headers: {
					[CoreHeaders.ROUTE_OVERRIDE]: workerConfig.name,
				},
			}
		);
		const json = await response.json();

		return json as ExportTypes;
	}

	override async fetchModule(
		id: string,
		importer?: string,
		options?: FetchFunctionOptions
	): Promise<vite.FetchResult> {
		// Additional modules (CompiledWasm, Data, Text)
		if (additionalModuleRE.test(id)) {
			return {
				externalize: id,
				type: "module",
			};
		}
		return super.fetchModule(id, importer, options);
	}
}

export const cloudflareBuiltInModules = [
	"cloudflare:email",
	"cloudflare:node",
	"cloudflare:sockets",
	"cloudflare:workers",
	"cloudflare:workflows",
];

const defaultConditions = ["workerd", "worker", "module", "browser"];

// v8 supports es2024 features as of 11.9
// workerd uses [v8 version 14.2 as of 2025-10-17](https://developers.cloudflare.com/workers/platform/changelog/#2025-10-17)
const target = "es2024";

// TODO: consider removing in next major to use default extensions
const resolveExtensions = [
	".mjs",
	".js",
	".mts",
	".ts",
	".jsx",
	".tsx",
	".json",
	".cjs",
	".cts",
	".ctx",
];

export function createCloudflareEnvironmentOptions({
	workerConfig,
	userConfig,
	mode,
	environmentName,
	isEntryWorker,
	isParentEnvironment,
	hasNodeJsCompat,
}: {
	workerConfig: ResolvedWorkerConfig;
	userConfig: vite.UserConfig;
	mode: vite.ConfigEnv["mode"];
	environmentName: string;
	isEntryWorker: boolean;
	isParentEnvironment: boolean;
	hasNodeJsCompat: boolean;
}): vite.EnvironmentOptions {
	const rollupOptions: vite.Rollup.RollupOptions = isParentEnvironment
		? {
				input: {
					[MAIN_ENTRY_NAME]: VIRTUAL_WORKER_ENTRY,
				},
				// workerd checks the types of the exports so we need to ensure that additional exports are not added to the entry module
				preserveEntrySignatures: "strict",
			}
		: {};
	const define = getProcessEnvReplacements(hasNodeJsCompat, mode);

	return {
		resolve: {
			// Note: in order for ssr pre-bundling to take effect we need to ask vite to treat all
			//       dependencies as not external
			noExternal: true,
			// We want to use `workerd` package exports if available (e.g. for postgres).
			conditions: [...defaultConditions, "development|production"],
			// The Cloudflare ones are proper builtins in the environment
			builtins: [...cloudflareBuiltInModules],
		},
		define,
		dev: {
			createEnvironment(name, config) {
				return new CloudflareDevEnvironment(name, config);
			},
		},
		build: {
			createEnvironment(name, config) {
				return new vite.BuildEnvironment(name, config);
			},
			target,
			emitAssets: true,
			manifest: isEntryWorker,
			outDir: getOutputDirectory(userConfig, environmentName),
			copyPublicDir: false,
			ssr: true,
			...(isRolldown
				? {
						rolldownOptions: {
							...rollupOptions,
							platform: "neutral",
							resolve: {
								extensions: resolveExtensions,
							},
						},
					}
				: {
						rollupOptions,
					}),
		},
		optimizeDeps: {
			// Note: ssr pre-bundling is opt-in and we need to enable it by setting `noDiscovery` to false
			noDiscovery: false,
			// Workaround for https://github.com/vitejs/vite/issues/20867
			// Longer term solution is to use full-bundle mode rather than `optimizeDeps`
			// @ts-expect-error - option added in Vite 7.3.1
			ignoreOutdatedRequests: true,
			// We need to normalize the path as it is treated as a glob and backslashes are therefore treated as escape characters.
			entries: vite.normalizePath(workerConfig.main),
			exclude: [...cloudflareBuiltInModules],
			...(isRolldown
				? {
						rolldownOptions: {
							platform: "neutral",
							resolve: {
								conditionNames: [...defaultConditions, "development"],
								extensions: resolveExtensions,
							},
							transform: {
								target,
								define,
							},
						},
					}
				: {
						esbuildOptions: {
							platform: "neutral",
							conditions: [...defaultConditions, "development"],
							resolveExtensions,
							target,
							define,
						},
					}),
		},
		// We manually set `process.env` replacements using `define`
		keepProcessEnv: true,
	};
}

/**
 * Gets `process.env` replacement values.
 * `process.env.NODE_ENV` is always replaced.
 * `process.env` is replaced with an empty object if `nodejs_compat` is not enabled
 * @param hasNodeJsCompat - whether `nodejs_compat` is enabled
 * @param mode - the Vite mode
 * @returns replacement values
 */
function getProcessEnvReplacements(
	hasNodeJsCompat: boolean,
	mode: vite.ConfigEnv["mode"]
): Record<string, string> {
	// eslint-disable-next-line turbo/no-undeclared-env-vars
	const nodeEnv = process.env.NODE_ENV || mode;
	const nodeEnvReplacements = {
		"process.env.NODE_ENV": JSON.stringify(nodeEnv),
		"global.process.env.NODE_ENV": JSON.stringify(nodeEnv),
		"globalThis.process.env.NODE_ENV": JSON.stringify(nodeEnv),
	};

	return hasNodeJsCompat
		? nodeEnvReplacements
		: {
				...nodeEnvReplacements,
				"process.env": "{}",
				"global.process.env": "{}",
				"globalThis.process.env": "{}",
			};
}

export function initRunners(
	resolvedPluginConfig: WorkersResolvedConfig,
	viteDevServer: vite.ViteDevServer,
	miniflare: Miniflare
): Promise<void[]> | undefined {
	const initPromises = [
		...resolvedPluginConfig.environmentNameToWorkerMap,
	].flatMap(([environmentName, worker]) => {
		debuglog("Initializing worker:", worker.config.name);
		const isEntryWorker =
			environmentName === resolvedPluginConfig.entryWorkerEnvironmentName;

		const childEnvironmentNames =
			resolvedPluginConfig.environmentNameToChildEnvironmentNamesMap.get(
				environmentName
			) ?? [];

		const parentInit = (
			viteDevServer.environments[environmentName] as CloudflareDevEnvironment
		).initRunner(miniflare, worker.config, {
			isEntryWorker,
			isParentEnvironment: true,
		});

		const childInits = childEnvironmentNames.map((childEnvironmentName) => {
			debuglog("Initializing child environment:", childEnvironmentName);
			return (
				viteDevServer.environments[
					childEnvironmentName
				] as CloudflareDevEnvironment
			).initRunner(miniflare, worker.config, {
				isEntryWorker: false,
				isParentEnvironment: false,
			});
		});

		return [parentInit, ...childInits];
	});

	return Promise.all(initPromises);
}
