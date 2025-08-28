import assert from "node:assert";
import * as util from "node:util";
import * as vite from "vite";
import { INIT_PATH, UNKNOWN_HOST, WORKER_ENTRY_PATH_HEADER } from "./shared";
import { getOutputDirectory } from "./utils";
import type { WorkerConfig, WorkersResolvedConfig } from "./plugin-config";
import type { Fetcher } from "@cloudflare/workers-types/experimental";
import type {
	MessageEvent,
	Miniflare,
	ReplaceWorkersTypes,
	WebSocket,
} from "miniflare";

interface WebSocketContainer {
	webSocket?: WebSocket;
}

const webSocketUndefinedError = "The WebSocket is undefined";
const debuglog = util.debuglog("@cloudflare:vite-plugin");

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
	#worker?: ReplaceWorkersTypes<Fetcher>;

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
		worker: ReplaceWorkersTypes<Fetcher>,
		workerConfig: WorkerConfig
	) {
		this.#worker = worker;

		const response = await this.#worker.fetch(
			new URL(INIT_PATH, UNKNOWN_HOST),
			{
				headers: {
					[WORKER_ENTRY_PATH_HEADER]: workerConfig.main,
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
}

export const cloudflareBuiltInModules = [
	"cloudflare:email",
	"cloudflare:sockets",
	"cloudflare:workers",
	"cloudflare:workflows",
];

const defaultConditions = ["workerd", "worker", "module", "browser"];
const target = "es2022";

export function createCloudflareEnvironmentOptions({
	workerConfig,
	userConfig,
	mode,
	environmentName,
	isEntryWorker,
	hasNodeJsCompat,
}: {
	workerConfig: WorkerConfig;
	userConfig: vite.UserConfig;
	mode: vite.ConfigEnv["mode"];
	environmentName: string;
	isEntryWorker: boolean;
	hasNodeJsCompat: boolean;
}): vite.EnvironmentOptions {
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
			rollupOptions: {
				input: workerConfig.main,
				// rolldown-only option
				...("rolldownVersion" in vite ? ({ platform: "neutral" } as any) : {}),
			},
		},
		optimizeDeps: {
			// Note: ssr pre-bundling is opt-in and we need to enable it by setting `noDiscovery` to false
			noDiscovery: false,
			// We need to normalize the path as it is treated as a glob and backslashes are therefore treated as escape characters.
			entries: vite.normalizePath(workerConfig.main),
			exclude: [...cloudflareBuiltInModules],
			esbuildOptions: {
				platform: "neutral",
				target,
				conditions: [...defaultConditions, "development"],
				resolveExtensions: [
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
				],
				define,
			},
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
	return Promise.all(
		Object.entries(resolvedPluginConfig.workers).map(
			async ([environmentName, workerConfig]) => {
				debuglog("Initializing worker:", workerConfig.name);
				const worker = await miniflare.getWorker(workerConfig.name);

				return (
					viteDevServer.environments[
						environmentName
					] as CloudflareDevEnvironment
				).initRunner(worker, workerConfig);
			}
		)
	);
}
