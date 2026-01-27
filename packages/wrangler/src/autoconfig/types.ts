import type { Framework } from "./frameworks/index";
import type { PackageJSON, RawConfig } from "@cloudflare/workers-utils";

export type AutoConfigDetails = {
	/** The name of the worker */
	workerName: string;
	/** The path to the project (defaults to cwd) */
	projectPath: string;
	/** The content of the project's package.json file (if any) */
	packageJson?: PackageJSON;
	/** Whether the project is already configured (no autoconfig required) */
	configured: boolean;
	/** Details about the detected framework (if any) */
	framework?: Framework;
	/** The build command used to build the project (if any) */
	buildCommand?: string;
	/** The output directory (if no framework is used, points to the raw asset files) */
	outputDir?: string;
};

export type AutoConfigOptions = {
	/** Whether to run autoconfig without actually applying any filesystem modification (default: false) */
	dryRun?: boolean;
	/**
	 * Whether the build command should be run (default: true)
	 *
	 * Note: When `dryRun` is `true` the build command is never run.
	 */
	runBuild?: boolean;
	/**
	 * Whether the confirmation prompts should be skipped (default: false)
	 *
	 * Note: When `dryRun` is `true` the the confirmation prompts are always skipped.
	 */
	skipConfirmations?: boolean;
	/**
	 * Whether to install Wrangler during autoconfig
	 */
	enableWranglerInstallation?: boolean;
};

export type AutoConfigSummary = {
	scripts: Record<string, string>;
	wranglerInstall: boolean;
	wranglerConfig?: RawConfig;
	frameworkConfiguration?: string;
	outputDir: string;
};
