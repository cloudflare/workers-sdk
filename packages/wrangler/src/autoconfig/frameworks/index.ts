import type { RawConfig } from "@cloudflare/workers-utils";

export type ConfigurationOptions = {
	outputDir: string;
	projectPath: string;
	workerName: string;
	dryRun: boolean;
};
export abstract class Framework {
	abstract name: string;

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
	): Promise<RawConfig> | RawConfig;

	configurationDescription?: string;
}
