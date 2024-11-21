import { builtinModules } from 'node:module';
import * as path from 'node:path';
import * as vite from 'vite';
import { getNodeCompatExternals } from './node-js-compat';
import { INIT_PATH, invariant, UNKNOWN_HOST } from './shared';
import { toMiniflareRequest } from './utils';
import type { NormalizedPluginConfig, WorkerOptions } from './plugin-config';
import type { Fetcher } from '@cloudflare/workers-types/experimental';
import type {
	MessageEvent,
	Miniflare,
	ReplaceWorkersTypes,
	WebSocket,
} from 'miniflare';

interface WebSocketContainer {
	webSocket?: WebSocket;
}

const webSocketUndefinedError = 'The WebSocket is undefined';

function createHotChannel(
	webSocketContainer: WebSocketContainer,
): vite.HotChannel {
	const listenersMap = new Map<string, Set<vite.HotChannelListener>>();

	const client: vite.HotChannelClient = {
		send(payload) {
			const webSocket = webSocketContainer.webSocket;
			invariant(webSocket, webSocketUndefinedError);

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
			invariant(webSocket, webSocketUndefinedError);

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
			invariant(webSocket, webSocketUndefinedError);

			webSocket.addEventListener('message', onMessage);
		},
		close() {
			const webSocket = webSocketContainer.webSocket;
			invariant(webSocket, webSocketUndefinedError);

			webSocket.removeEventListener('message', onMessage);
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
					upgrade: 'websocket',
				},
			},
		);

		invariant(response.ok, 'Failed to initialize module runner');

		const webSocket = response.webSocket;
		invariant(webSocket, 'Failed to establish WebSocket');

		webSocket.accept();

		this.#webSocketContainer.webSocket = webSocket;
	}

	async dispatchFetch(request: Request) {
		invariant(this.#worker, 'Runner not initialized');

		return this.#worker.fetch(toMiniflareRequest(request)) as any;
	}
}

const cloudflareBuiltInModules = [
	'cloudflare:email',
	'cloudflare:sockets',
	'cloudflare:workers',
];

export function createCloudflareEnvironmentOptions(
	options: WorkerOptions,
	userConfig: vite.UserConfig,
): vite.EnvironmentOptions {
	return vite.mergeConfig(
		{
			resolve: {
				// Note: in order for ssr pre-bundling to take effect we need to ask vite to treat all
				//       dependencies as not external
				noExternal: true,
				// We want to use `workerd` package exports if available (e.g. for postgres).
				conditions: ['workerd', 'module', 'browser', 'development|production'],
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
				// This is a bit of a hack to make sure the user can't override the output directory at the environment level
				outDir: userConfig.build?.outDir ?? 'dist',
				ssr: true,
				rollupOptions: {
					// Note: vite starts dev pre-bundling crawling from either optimizeDeps.entries or rollupOptions.input
					//       so the input value here serves both as the build input as well as the starting point for
					//       dev pre-bundling crawling (were we not to set this input field we'd have to appropriately set
					//       optimizeDeps.entries in the dev config)
					input: userConfig.root
						? path.resolve(userConfig.root, options.main)
						: path.resolve(options.main),
					external: [...cloudflareBuiltInModules, ...getNodeCompatExternals()],
				},
			},
			optimizeDeps: {
				// Note: ssr pre-bundling is opt-in, and we need to enabled it by setting noDiscovery to false
				noDiscovery: false,
				exclude: [
					...cloudflareBuiltInModules,
					// we have to exclude all node modules to work in dev-mode not just the unenv externals...
					...builtinModules.concat(builtinModules.map((m) => `node:${m}`)),
				],
				esbuildOptions: {
					platform: 'neutral',
					resolveExtensions: [
						'.mjs',
						'.js',
						'.mts',
						'.ts',
						'.jsx',
						'.tsx',
						'.json',
						'.cjs',
						'.cts',
						'.ctx',
					],
				},
			},
			keepProcessEnv: true,
		} satisfies vite.EnvironmentOptions,
		options.overrides ?? {},
	);
}

export function initRunners(
	normalizedPluginConfig: NormalizedPluginConfig,
	miniflare: Miniflare,
	viteDevServer: vite.ViteDevServer,
): Promise<void[]> {
	return Promise.all(
		Object.keys(normalizedPluginConfig.workers).map(async (name) => {
			const worker = await miniflare.getWorker(name);

			return (
				viteDevServer.environments[name] as CloudflareDevEnvironment
			).initRunner(worker);
		}),
	);
}
