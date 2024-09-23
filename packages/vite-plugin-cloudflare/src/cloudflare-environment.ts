import * as vite from 'vite';
import { Miniflare, Response as MiniflareResponse } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { UNKNOWN_HOST, INIT_PATH } from './shared';
import type { FetchFunctionOptions } from 'vite/module-runner';

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
	#miniflare: Miniflare;
	#initialized = false;

	constructor(
		name: string,
		config: vite.ResolvedConfig,
		options: CloudflareEnvironmentOptions
	) {
		super(name, config, { hot: false });
		this.#options = options;
		this.#miniflare = new Miniflare({
			// ...workerOptions
			// name: '',
			modulesRoot: '/',
			modules: [
				{
					type: 'ESModule',
					path: fileURLToPath(import.meta.resolve('./runner/worker.js')),
				},
			],
			unsafeEvalBinding: '__VITE_UNSAFE_EVAL__',
			bindings: {
				// ...bindings,
				__VITE_ROOT__: this.config.root,
			},
			serviceBindings: {
				// ...serviceBindings
				__VITE_FETCH_MODULE__: async (request) => {
					const args = (await request.json()) as [
						string,
						string,
						FetchFunctionOptions
					];

					try {
						const result = await this.fetchModule(...args);

						return new MiniflareResponse(JSON.stringify(result));
					} catch (error) {
						const result = {
							externalize: args[0],
							type: 'builtin',
						} satisfies vite.FetchResult;

						return new MiniflareResponse(JSON.stringify(result));
					}
				},
			},
		});
	}

	override async init() {
		await super.init();

		if (!this.#initialized) {
			const initResponse = await this.#miniflare.dispatchFetch(
				new URL(INIT_PATH, UNKNOWN_HOST),
				{
					headers: {
						upgrade: 'websocket',
						'x-vite-entrypoint': this.#options.entrypoint,
					},
				}
			);

			if (!initResponse.ok) {
				throw new Error('Failed to initialize module runner');
			}

			const webSocket = initResponse.webSocket;

			if (!webSocket) {
				throw new Error('Failed to establish a WebSocket');
			}
		}
	}

	async dispatchFetch(request: Request) {
		return this.#miniflare.dispatchFetch(request.url, {
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
