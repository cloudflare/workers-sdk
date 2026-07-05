import type { AutoConfigContext } from "./context";
import type { Framework } from "./frameworks/framework-class";
import type { PackageManager } from "@cloudflare/workers-utils";
import type { PackageJSON, RawConfig } from "@cloudflare/workers-utils";

/** Makes the specified keys of T optional. */
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type AutoConfigDetailsBase = {
	/** The name of the worker */
	workerName: string;
	/** The path to the project (defaults to cwd) */
	projectPath: string;
	/** The content of the project's package.json file (if any) */
	packageJson?: PackageJSON;
	/** Whether the project is already configured (no autoconfig required) */
	configured: boolean;
	/** Details about the detected framework. It can be a JS framework or 'Static' if no actual JS framework is used. */
	framework?: Framework;
	/** The build command used to build the project (if any) */
	buildCommand?: string;
	/** The output directory (if no framework is used, points to the raw asset files) */
	outputDir?: string;
	/** The detected package manager for the project */
	packageManager: PackageManager;
	/** Whether the current path is at the root of a workspace */
	isWorkspaceRoot?: boolean;
	/** The broad project type selected by the adapter model. */
	projectKind?: ProjectKind;
	/** The selected adapter identifier. */
	adapterId?: string;
	/** The selected adapter display name. */
	adapterName?: string;
	/** Detection confidence for the selected adapter. */
	confidence?: DetectionConfidence;
	/** Sanitized, path-free detection evidence to show users and report in summaries. */
	evidence?: string[];
	/** Coarse source category for explicit targets. Never contains a raw path. */
	sourceCategory?: SourceCategory;
	/** Adapter-owned configuration plan. Framework projects continue to use Framework.configure(). */
	configurationPlan?: ConfigurationPlan;
	/** Adapter-private deployment target details used by Wrangler to prepare no-write deploys. */
	deployTarget?: DeployTarget;
};

export type AutoConfigDetailsForConfiguredProject = Optional<
	AutoConfigDetailsBase,
	// If AutoConfig detects that the project is already configured it's unnecessary to check
	// what framework is being used nor the output directory, so in this case thee fields are optional
	"framework" | "outputDir"
> & {
	configured: true;
};

export type AutoConfigDetailsForNonConfiguredProject = AutoConfigDetailsBase & {
	configured: false;
};

export type AutoConfigDetails =
	| AutoConfigDetailsForConfiguredProject
	| AutoConfigDetailsForNonConfiguredProject;

export type AutoConfigOptions = {
	/** The autoconfig context providing logger, dialogs, and other dependencies. */
	context: AutoConfigContext;
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

export type ProjectKind =
	| "framework"
	| "static-assets"
	| "single-file-site"
	| "worker-entrypoint"
	| "node-http-server"
	| "container-image";

export type DetectionConfidence = "high" | "medium" | "low";

export type SourceCategory =
	| "html-file"
	| "static-file"
	| "directory"
	| "package-app"
	| "worker-script"
	| "dockerfile"
	| "unknown";

export type DeployIntent = {
	trigger: "bare" | "explicit-target" | "setup";
	originalTarget?: string;
	targetKind?: "file" | "directory" | "missing";
	currentDeployInterpretation?: "script" | "assets" | "none";
	sourceCategory?: SourceCategory;
	staticAssetsAutoConfig?: boolean;
	allowNonInteractivePersistentSetup?: boolean;
};

export type ConfigurationPlan = {
	mode: "persistent" | "no-write";
	wranglerConfig?: RawConfig | null;
	packageJsonScripts?: Record<string, string>;
	dependencies?: Array<{ name: string; dev?: boolean }>;
	filesToCreate?: Array<{ path: string; contents: string }>;
	commands?: Array<{
		command: string;
		when: "setup" | "build";
		label?: string;
	}>;
	warnings?: string[];
	generatedFiles?: string[];
	deploy?: {
		assets?: string;
		script?: string;
		generatedAssetsDirectory?: "temporary" | "existing" | "build-output";
	};
	summaryFields?: Record<string, string | number | boolean>;
};

export type DeployTarget =
	| {
			type: "single-html-file";
			sourcePath: string;
	  }
	| {
			type: "assets-directory";
			assetsDirectory: string;
	  }
	| {
			type: "static-app-output";
			assetsDirectory: string;
	  };

export type AutoConfigSummary = {
	scripts: Record<string, string>;
	wranglerInstall: boolean;
	wranglerConfig?: RawConfig;
	frameworkConfiguration?: string;
	outputDir?: string;
	frameworkId?: string;
	buildCommand?: string;
	deployCommand?: string;
	versionCommand?: string;
	projectKind?: ProjectKind;
	adapterId?: string;
	adapterName?: string;
	confidence?: DetectionConfidence;
	deployMode?: "persistent" | "no-write";
	sourceCategory?: SourceCategory;
	evidence?: string[];
	warnings?: string[];
	generatedFiles?: string[];
	deploy?: ConfigurationPlan["deploy"];
	summaryFields?: Record<string, string | number | boolean>;
};
