import * as vite from 'vite';
import { Miniflare, Response as MiniflareResponse } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { UNKNOWN_HOST, INIT_PATH } from './shared';
import type { FetchFunctionOptions } from 'vite/module-runner';
import type { ReplaceWorkersTypes } from 'miniflare';
import type { Fetcher } from '@cloudflare/workers-types/experimental';
// import type { ReplaceWorkersTypes } from 'miniflare';

export interface CloudflareEnvironmentOptions {
	entrypoint: string;
	route?: {
		path: string;
		rewrite?: (path: string) => string;
	};
	// Defaults to "./wrangler.toml"
	wranglerConfig?: string;
	overrides?: vite.EnvironmentOptions;
}

export class CloudflareDevEnvironment extends vite.DevEnvironment {
	#options: CloudflareEnvironmentOptions;
	#runner?: ReplaceWorkersTypes<Fetcher>;

	constructor(
		name: string,
		config: vite.ResolvedConfig,
		options: CloudflareEnvironmentOptions
	) {
		super(name, config, { hot: false });
		this.#options = options;
	}

	async initRunner(miniflare: Miniflare) {
		this.#runner = await miniflare.getWorker(this.name);

		const response = await this.#runner.fetch(
			new URL(INIT_PATH, UNKNOWN_HOST),
			{
				headers: {
					upgrade: 'websocket',
					'x-vite-entrypoint': this.#options.entrypoint,
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
	}

	async dispatchFetch(request: Request) {
		if (!this.#runner) {
			throw new Error('Runner not initialized');
		}

		return this.#runner.fetch(request.url, {
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
				ssr: options.entrypoint,
			},
			webCompatible: true,
		} satisfies vite.EnvironmentOptions,
		options.overrides ?? {}
	);
}
