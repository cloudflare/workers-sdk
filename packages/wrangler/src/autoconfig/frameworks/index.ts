import type { PackageManager } from "../../package-manager";
import type { FrameworkInfo } from "./get-framework";
import type { RawConfig } from "@cloudflare/workers-utils";

export type ConfigurationOptions = {
	outputDir: string;
	projectPath: string;
	workerName: string;
	dryRun: boolean;
	packageManager: PackageManager;
};

export type PackageJsonScriptsOverrides = {
	preview?: string; // default is `npm run build && wrangler dev`
	deploy?: string; // default is `npm run build && wrangler deploy`
	typegen?: string; // default is `wrangler types`
};

export type ConfigurationResults = {
	/** The wrangler configuration that the framework's `configure()` hook should generate. `null` if autoconfig should not create the wrangler file (in case an external tool already does that) */
	wranglerConfig: RawConfig;
	// Scripts to override in the package.json. Most frameworks should not need to do this, as their default detected build command will be sufficient
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides;
	// Build command to override the standard one (`npm run build` or framework's build command)
	buildCommandOverride?: string;
	// Deploy command to override the standard one (`npx wrangler deploy`)
	deployCommandOverride?: string;
	// Version command to override the standard one (`npx wrangler versions upload`)
	versionCommandOverride?: string;
};

export abstract class Framework {
	readonly id: string;
	readonly name: string;

	constructor(frameworkInfo: Pick<FrameworkInfo, "id" | "name">) {
		this.id = frameworkInfo.id;
		this.name = frameworkInfo.name;
	}

	isConfigured(_projectPath: string): boolean {
		return false;
	}

	abstract configure(
		options: ConfigurationOptions
	): Promise<ConfigurationResults> | ConfigurationResults;

	configurationDescription?: string;

	autoConfigSupported = true;
}
