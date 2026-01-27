import type { RawConfig } from "@cloudflare/workers-utils";

export type ConfigurationOptions = {
	outputDir: string;
	projectPath: string;
	workerName: string;
	dryRun: boolean;
};

export type PackageJsonScriptsOverrides = {
	preview?: string; // default is `npm run build && wrangler dev`
	deploy?: string; // default is `npm run build && wrangler deploy`
	typegen?: string; // default is `wrangler types`
};

export type ConfigurationResults = {
	/** The wrangler configuration that the configuration should generate. `null` if autoconfig should not create the wrangler file (in case an external too already does that) */
	wranglerConfig: RawConfig | null;
	// Scripts to override in the package.json. Most frameworks should not need to do this, as their default detected build command will be sufficient
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides;
	buildCommand?: string;
};

export abstract class Framework {
	constructor(public name: string = "Static") {}

	isConfigured(_projectPath: string): boolean {
		return false;
	}

	abstract configure(
		options: ConfigurationOptions
	): Promise<ConfigurationResults> | ConfigurationResults;

	configurationDescription?: string;

	autoConfigSupported = true;
}
