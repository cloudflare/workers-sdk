import assert from "node:assert";
import * as vite from "vite";
import { isNodeCompat } from "./node-js-compat";
import { INIT_PATH, UNKNOWN_HOST, VITE_DEV_METADATA_HEADER } from "./shared";
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
					[VITE_DEV_METADATA_HEADER]: JSON.stringify({
						entryPath: workerConfig.main,
					}),
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

const defaultConditions = ["workerd", "module", "browser"];
const target = "es2022";

export function createCloudflareEnvironmentOptions(
	workerConfig: WorkerConfig,
	userConfig: vite.UserConfig,
	environment: { name: string; isEntry: boolean }
): vite.EnvironmentOptions {
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
			manifest: environment.isEntry,
			outDir: getOutputDirectory(userConfig, environment.name),
			copyPublicDir: false,
			ssr: true,
			rollupOptions: {
				input: workerConfig.main,
			},
		},
		optimizeDeps: {
			// Note: ssr pre-bundling is opt-in and we need to enable it by setting `noDiscovery` to false
			noDiscovery: false,
			entries: workerConfig.main,
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
			},
		},
		// if nodeCompat is enabled then let's keep the real process.env so that workerd can manipulate it
		keepProcessEnv: isNodeCompat(workerConfig),
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
