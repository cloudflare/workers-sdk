import assert from "node:assert";
import { builtinModules } from "node:module";
import * as vite from "vite";
import { getNodeCompatExternals } from "./node-js-compat";
import { INIT_PATH, UNKNOWN_HOST } from "./shared";
import { getOutputDirectory } from "./utils";
import type { ResolvedPluginConfig, WorkerConfig } from "./plugin-config";
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

	async initRunner(worker: ReplaceWorkersTypes<Fetcher>) {
		this.#worker = worker;

		const response = await this.#worker.fetch(
			new URL(INIT_PATH, UNKNOWN_HOST),
			{
				headers: {
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

const cloudflareBuiltInModules = [
	"cloudflare:email",
	"cloudflare:sockets",
	"cloudflare:workers",
	"cloudflare:workflows",
];

export function createCloudflareEnvironmentOptions(
	workerConfig: WorkerConfig,
	userConfig: vite.UserConfig,
	environmentName: string
): vite.EnvironmentOptions {
	return {
		resolve: {
			// Note: in order for ssr pre-bundling to take effect we need to ask vite to treat all
			//       dependencies as not external
			noExternal: true,
			// We want to use `workerd` package exports if available (e.g. for postgres).
			conditions: ["workerd", "module", "browser", "development|production"],
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
			outDir: getOutputDirectory(userConfig, environmentName),
			ssr: true,
			rollupOptions: {
				// Note: vite starts dev pre-bundling crawling from either optimizeDeps.entries or rollupOptions.input
				//       so the input value here serves both as the build input as well as the starting point for
				//       dev pre-bundling crawling (were we not to set this input field we'd have to appropriately set
				//       optimizeDeps.entries in the dev config)
				input: workerConfig.main,
				external: [...cloudflareBuiltInModules, ...getNodeCompatExternals()],
			},
		},
		optimizeDeps: {
			// Note: ssr pre-bundling is opt-in and we need to enable it by setting `noDiscovery` to false
			noDiscovery: false,
			exclude: [
				...cloudflareBuiltInModules,
				// we have to exclude all node modules to work in dev-mode not just the unenv externals...
				...builtinModules.concat(builtinModules.map((m) => `node:${m}`)),
			],
			esbuildOptions: {
				platform: "neutral",
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
		keepProcessEnv: false,
	};
}

export function initRunners(
	resolvedPluginConfig: ResolvedPluginConfig,
	viteDevServer: vite.ViteDevServer,
	miniflare: Miniflare
): Promise<void[]> | undefined {
	if (resolvedPluginConfig.type === "assets-only") {
		return;
	}

	return Promise.all(
		Object.entries(resolvedPluginConfig.workers).map(
			async ([environmentName, workerConfig]) => {
				const worker = await miniflare.getWorker(workerConfig.name);

				return (
					viteDevServer.environments[
						environmentName
					] as CloudflareDevEnvironment
				).initRunner(worker);
			}
		)
	);
}
