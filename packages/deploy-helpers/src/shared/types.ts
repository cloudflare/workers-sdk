import type {
	AssetsOptions,
	LegacyAssetPaths,
	CfModule,
	CfModuleType,
	Config,
	EphemeralDirectory,
	FetchKVGetValueFetcher,
	FetchResultFetcher,
	FetchListResultFetcher,
	FetchPagedListResultFetcher,
	Logger,
	Route,
	Entry,
} from "@cloudflare/workers-utils";

/**
 * client needs to handle logger and fetch/auth implementation
 * these are passed into this package to handle any API requests/logs
 */
export type DeployHelpersContext = {
	fetchResult: FetchResultFetcher;
	fetchListResult: FetchListResultFetcher;
	fetchPagedListResult: FetchPagedListResultFetcher;
	fetchKVGetValue: FetchKVGetValueFetcher;
	logger: Logger;
	confirm: (
		text: string,
		options?: { defaultValue?: boolean; fallbackValue?: boolean }
	) => Promise<boolean>;
	prompt: (
		text: string,
		options?: { defaultValue?: string }
	) => Promise<string>;
	isNonInteractiveOrCI: () => boolean;
};

/**
 * Shared fields produced by merging CLI args with wrangler config.
 * After this point, no raw config/arg merging should happen.
 *
 * Use props for all resolved/merged values. Only access config directly
 * for raw values that aren't merged with CLI args (e.g., config.durable_objects,
 * config.unsafe, config.tail_consumers).
 */
export type SharedDeployVersionsProps = {
	/** Merged from args.script/config.main/config.site.entry-point/config.assets. */
	entry: Entry;
	/** Merged: --name arg ?? config.name, with CI override applied. Validated as required separately. */
	name: string | undefined;
	/** Merged: --compatibility-date arg ?? config.compatibility_date. Still optional — validated as required later. */
	compatibilityDate: string | undefined;
	/** Merged: --compatibility-flags arg ?? config.compatibility_flags. */
	compatibilityFlags: string[];
	/** Merged from --assets arg and config.assets. */
	assetsOptions: AssetsOptions | undefined;
	/** Merged: --jsx-factory arg || config.jsx_factory. */
	jsxFactory: string;
	/** Merged: --jsx-fragment arg || config.jsx_fragment. */
	jsxFragment: string;
	/** Merged: --tsconfig arg ?? config.tsconfig. */
	tsconfig: string | undefined;
	/** Merged: --minify arg ?? config.minify. */
	minify: boolean | undefined;
	/** Merged: !(--bundle arg ?? !config.no_bundle). */
	noBundle: boolean;
	/** Merged: --upload-source-maps arg ?? config.upload_source_maps. */
	uploadSourceMaps: boolean | undefined;
	/** Merged: --keep-vars arg || config.keep_vars. */
	keepVars: boolean;
	/** Merged from --site arg and config.site. */
	isWorkersSite: boolean;
	/** Merged: { ...config.define, ...--define arg }. CLI overrides config. */
	defines: Record<string, string>;
	/** Merged: { ...config.alias, ...--alias arg }. CLI overrides config. */
	alias: Record<string, string>;
	/**
	 * Whether to use the deprecated service environments API path.
	 * True only when config opts in (legacy_env: false) AND --env is specified.
	 */
	useServiceEnvApiPath: boolean;
	/** Output directory for the bundled Worker. From --outdir arg or a temp directory. */
	destination: string | EphemeralDirectory;
	/** From --dry-run arg. */
	dryRun: boolean;
	/** From --env arg. */
	env: string | undefined;
	/** From --outdir arg. Already used to derive `destination`, but also needed for outdir README and noBundleWorker. */
	outdir: string | undefined;
	/** From --outfile arg. */
	outfile: string | undefined;
	/** From --tag arg. */
	tag: string | undefined;
	/** From --message arg. */
	message: string | undefined;
	/** From --secrets-file arg. */
	secretsFile: string | undefined;
	/** From collectKeyValues(--var arg). CLI-only vars; config vars flow separately via getBindings(config). */
	cliVars: Record<string, string>;
	/** From --experimental-auto-create arg. */
	experimentalAutoCreate: boolean;
	/** Resolved from requireAuth() before calling deploy-helpers. undefined only in dry-run. */
	accountId: string | undefined;
	/** Resolved from getMetricsUsageHeaders() / config.send_metrics. Controls whether usage metrics headers are sent with upload requests. */
	sendMetrics: boolean;
	/** Resolved from getFlag("RESOURCES_PROVISION"). Controls whether bindings are auto-provisioned before upload. */
	resourcesProvision: boolean;
};

export type DeployProps = SharedDeployVersionsProps & {
	/** Discriminant for DeployProps vs VersionsUploadProps */
	command: "deploy";
	/** Merged from --site arg and config.site. */
	legacyAssetPaths: LegacyAssetPaths | undefined;
	/** Merged: --triggers arg ?? config.triggers.crons. */
	triggers: string[] | undefined;
	/** Merged: --routes arg ?? config.routes ?? config.route. AND --domains and custom_domains*/
	routes: Route[];
	/** Merged: --logpush arg ?? config.logpush. */
	logpush: boolean | undefined;
	/** From --dispatch-namespace arg. Deploy-only (Workers for Platforms). */
	dispatchNamespace: string | undefined;
	/** From --strict arg. Deploy-only. */
	strict: boolean;
	/** From --metafile arg. Deploy-only. */
	metafile: string | boolean | undefined;
	/** From --old-asset-ttl arg. Deploy-only. */
	oldAssetTtl: number | undefined;
	/** From --containers-rollout arg. Deploy-only. */
	containersRollout: "immediate" | "gradual" | "none" | undefined;
};

export type VersionsUploadProps = SharedDeployVersionsProps & {
	/** Discriminant for DeployProps vs VersionsUploadProps */
	command: "versions upload";
	/** CLI-only (--preview-alias), or auto-generated from CI branch name. */
	previewAlias: string | undefined;
};

export type BuildBundleInfo = {
	sourceMapPath?: string | undefined;
	sourceMapMetadata?: { tmpDir: string; entryDirectory: string } | undefined;
};

export type WorkerBuildResult = {
	modules: CfModule[];
	dependencies: Record<string, { bytesInOutput: number }>;
	resolvedEntryPointPath: string;
	bundleType: CfModuleType;
	content: string;
	bundle: BuildBundleInfo;
};

export interface TriggerDeployment {
	targets: string[];
	error?: Error;
}

export type TriggerProps = {
	config: Config;
	accountId: string;
	scriptName: string;
	env: string | undefined;
	crons: string[] | undefined;
	routes: Route[];
	useServiceEnvironments: boolean;
	firstDeploy: boolean;
};
