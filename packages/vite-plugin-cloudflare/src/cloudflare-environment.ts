import * as vite from 'vite';
import { UNKNOWN_HOST, INIT_PATH } from './shared';
import type { ReplaceWorkersTypes, WebSocket, MessageEvent } from 'miniflare';
import type { Fetcher } from '@cloudflare/workers-types/experimental';

export interface CloudflareEnvironmentOptions {
	main: string;
	wranglerConfig?: string;
	overrides?: vite.EnvironmentOptions;
}

interface Runner {
	worker?: ReplaceWorkersTypes<Fetcher>;
	webSocket?: WebSocket;
}

function createHotChannel(runner: Runner): vite.HotChannel {
	const listenersMap = new Map<string, Set<Function>>();

	function onMessage(event: MessageEvent) {
		const payload = JSON.parse(event.data.toString()) as vite.CustomPayload;
		const listeners = listenersMap.get(payload.event) ?? new Set();

		for (const listener of listeners) {
			listener(payload.data);
		}
	}

	// TODO: modify to assert WebSocket
	return {
		send(...args: [string, unknown] | [vite.HotPayload]) {
			let payload: vite.HotPayload;

			if (typeof args[0] === 'string') {
				payload = {
					type: 'custom',
					event: args[0],
					data: args[1],
				};
			} else {
				payload = args[0];
			}

			runner.webSocket?.send(JSON.stringify(payload));
		},
		on(event: string, listener: Function) {
			const listeners = listenersMap.get(event) ?? new Set();
			listeners.add(listener);
			listenersMap.set(event, listeners);
		},
		off(event, listener) {
			listenersMap.get(event)?.delete(listener);
		},
		listen() {
			runner.webSocket?.addEventListener('message', onMessage);
		},
		close() {
			runner.webSocket?.removeEventListener('message', onMessage);
		},
	};
}

export class CloudflareDevEnvironment extends vite.DevEnvironment {
	#options: CloudflareEnvironmentOptions;
	#runner: Runner;

	constructor(
		name: string,
		config: vite.ResolvedConfig,
		options: CloudflareEnvironmentOptions
	) {
		// It would be good if we could avoid passing this object around and mutating it
		const runner = {};
		super(name, config, { hot: createHotChannel(runner) });
		this.#options = options;
		this.#runner = runner;
	}

	async initRunner(worker: ReplaceWorkersTypes<Fetcher>) {
		this.#runner.worker = worker;

		const response = await this.#runner.worker.fetch(
			new URL(INIT_PATH, UNKNOWN_HOST),
			{
				headers: {
					upgrade: 'websocket',
					'x-vite-main': this.#options.main,
				},
			}
		);

		if (!response.ok) {
			throw new Error('Failed to initialize module runner');
		}

		const webSocket = response.webSocket;

		if (!webSocket) {
			throw new Error('Failed to establish a WebSocket');
		}

		webSocket.accept();

		this.#runner.webSocket = webSocket;
	}

	async dispatchFetch(request: Request) {
		if (!this.#runner.worker) {
			throw new Error('Runner not initialized');
		}

		return this.#runner.worker.fetch(request.url, {
			method: request.method,
			headers: [['accept-encoding', 'identity'], ...request.headers],
			body: request.body,
			duplex: 'half',
		}) as any;
	}
}

export function createCloudflareEnvironment(
	options: CloudflareEnvironmentOptions
): vite.EnvironmentOptions {
	return vite.mergeConfig(
		{
			dev: {
				createEnvironment(name, config) {
					return new CloudflareDevEnvironment(name, config, options);
				},
			},
			build: {
				createEnvironment(name, config) {
					return new vite.BuildEnvironment(name, config);
				},
				// Use the entrypoint for the 'build' command
				ssr: options.main,
			},
			webCompatible: true,
		} satisfies vite.EnvironmentOptions,
		options.overrides ?? {}
	);
}
