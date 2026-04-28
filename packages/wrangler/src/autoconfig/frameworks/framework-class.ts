import assert from "node:assert";
import semiver from "semiver";
import { logger } from "../../logger";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { getInstalledPackageVersion } from "./utils/packages";
import type { AutoConfigFrameworkPackageInfo, FrameworkInfo } from ".";
import type { PackageManager } from "../../package-manager";
import type { RawConfig } from "@cloudflare/workers-utils";

export abstract class Framework {
	readonly id: FrameworkInfo["id"];
	readonly name: FrameworkInfo["name"];

	#frameworkVersion: string | undefined;
	get frameworkVersion(): string {
		assert(
			this.#frameworkVersion,
			`The version for ${JSON.stringify(this.name)} is unexpectedly missing`
		);
		return this.#frameworkVersion;
	}

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

	/**
	 * Validates the installed framework version against the supported range and
	 * stores it for later access via the `frameworkVersion` getter.
	 * Warns via `logger` if the version exceeds `maximumKnownMajorVersion`.
	 *
	 * @param projectPath - Path to the project root used to resolve the installed version.
	 * @param frameworkPackageInfo - Package metadata including name and version bounds.
	 * @throws {AssertionError} If the installed version cannot be determined.
	 * @throws {AutoConfigFrameworkConfigurationError} If the version is below `minimumVersion`.
	 */
	validateFrameworkVersion(
		projectPath: string,
		frameworkPackageInfo: AutoConfigFrameworkPackageInfo
	) {
		const frameworkVersion = getInstalledPackageVersion(
			frameworkPackageInfo.name,
			projectPath
		);

		assert(
			frameworkVersion,
			`Unable to detect the version of the \`${frameworkPackageInfo.name}\` package`
		);

		if (semiver(frameworkVersion, frameworkPackageInfo.minimumVersion) < 0) {
			throw new AutoConfigFrameworkConfigurationError(
				`The version of ${this.name} used in the project (${JSON.stringify(
					frameworkVersion
				)}) cannot be automatically configured. Please update the ${
					this.name
				} version to at least ${JSON.stringify(
					frameworkPackageInfo.minimumVersion
				)} and try again.`
			);
		}

		if (
			semiver(frameworkVersion, frameworkPackageInfo.maximumKnownMajorVersion) >
			0
		) {
			logger.warn(
				`The version of ${this.name} used in the project (${JSON.stringify(
					frameworkVersion
				)}) is not officially supported, and may fail to correctly configure. Please report any issues to https://github.com/cloudflare/workers-sdk/issues`
			);
		}

		this.#frameworkVersion = frameworkVersion;
	}
}

export type ConfigurationOptions = {
	outputDir: string;
	projectPath: string;
	workerName: string;
	dryRun: boolean;
	packageManager: PackageManager;
	isWorkspaceRoot: boolean;
};

export type PackageJsonScriptsOverrides = {
	preview?: string; // default is `npm run build && wrangler dev`
	deploy?: string; // default is `npm run build && wrangler deploy`
	typegen?: string; // default is `wrangler types`
};

export type ConfigurationResults = {
	/** The wrangler configuration that the framework's `configure()` hook should generate. `null` if autoconfig should not create the wrangler file (in case an external tool already does that) */
	wranglerConfig: RawConfig | null;
	// Scripts to override in the package.json. Most frameworks should not need to do this, as their default detected build command will be sufficient
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides;
	// Build command to override the standard one (`npm run build` or framework's build command)
	buildCommandOverride?: string;
	// Deploy command to override the standard one (`npx wrangler deploy`)
	deployCommandOverride?: string;
	// Version command to override the standard one (`npx wrangler versions upload`)
	versionCommandOverride?: string;
};
