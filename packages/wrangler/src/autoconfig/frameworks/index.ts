import type { RawConfig } from "@cloudflare/workers-utils";

export type ConfigurationOptions = {
	outputDir: string;
	projectPath: string;
	workerName: string;
	dryRun: boolean;
};

export type ConfigurationResults = {
	wranglerConfig: RawConfig;
};

export abstract class Framework {
	constructor(public name: string = "Static") {}

	// Override commands used to configure the project. Most frameworks should not need to do this, as their default detected build command will be sufficient
	preview?: string; // default is `npm run build && wrangler dev`
	deploy?: string; // default is `npm run build && wrangler deploy`
	typegen?: string; // default is `wrangler types`

	/** Some frameworks (i.e. Nuxt) don't need additional configuration */
	get configured() {
		return false;
	}

	abstract configure(
		options: ConfigurationOptions
	): Promise<ConfigurationResults> | ConfigurationResults;

	configurationDescription?: string;
}
