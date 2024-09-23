import * as vite from 'vite';

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

	constructor(
		name: string,
		config: vite.ResolvedConfig,
		options: CloudflareEnvironmentOptions
	) {
		super(name, config, { hot: vite.createServerHotChannel() });
		this.#options = options;
	}

	dispatchFetch(request: Request) {
		return new Promise<Response>((resolve) =>
			resolve(new Response('Hello world'))
		);
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
