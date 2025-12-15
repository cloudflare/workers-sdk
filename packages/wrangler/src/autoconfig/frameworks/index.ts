import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import { findUpSync } from "find-up";
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
	wranglerConfig: RawConfig;
	// Scripts to override in the package.json. Most frameworks should not need to do this, as their default detected build command will be sufficient
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides;
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
}

// Make a best-effort attempt to find the exact version of the installed package
export function getInstalledPackageVersion(
	packageName: string,
	projectPath: string
): string | undefined {
	try {
		const packagePath = require.resolve(packageName, {
			paths: [projectPath],
		});
		const packageJsonPath = findUpSync("package.json", { cwd: packagePath });
		if (packageJsonPath) {
			const packageJson = parsePackageJSON(
				readFileSync(packageJsonPath),
				packageJsonPath
			);
			return packageJson.version;
		}
	} catch {}
}
