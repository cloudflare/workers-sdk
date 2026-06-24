import type {
	ValidatedAssetsOptions,
	LegacyAssetPaths,
	CfModule,
	CfModuleType,
	CfWorkerSourceMap,
	Config,
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
	select: <Values extends string>(
		text: string,
		options: {
			choices: {
				title: string;
				description?: string;
				value: Values;
			}[];
			defaultOption?: number;
			fallbackOption?: number;
		}
	) => Promise<Values>;
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
	/**
	 * Validated/resolved assets directory, merged from --assets arg and
	 * config.assets. The full AssetsOptions are resolved later via
	 * `resolveAssetOptions`.
	 */
	assetsDir: ValidatedAssetsOptions | undefined;
	/**
	 * The user Worker entry, merged: --script arg ?? config.main. Undefined for
	 * assets-only Workers. Drives `has_user_worker` when resolving assets.
	 */
	main: string | undefined;
	/** Merged: --keep-vars arg || config.keep_vars. */
	keepVars: boolean;
	/** Merged from --site arg and config.site. */
	isWorkersSite: boolean;
	/**
	 * Whether to use the deprecated service environments API path.
	 * True only when config opts in (legacy_env: false) AND --env is specified.
	 */
	useServiceEnvApiPath: boolean;
	/** From --dry-run arg. */
	dryRun: boolean;
	/** From --env arg. */
	env: string | undefined;
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
	/** Controls whether provisioned resource IDs are written back to the config file. */
	skipProvisioningConfigWriteback: boolean;
	/** temporary hack - cf is not yet a recognised deploy source, so any deploys from cf comes back normalised to 'api'*/
	skipLastDeployedFromApiCheck: boolean;
	/** From --strict arg. In strict mode, conflicting pre-upload checks abort instead of auto-continuing. */
	strict: boolean;
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

export type WorkerBuildResult = {
	modules: CfModule[];
	sourceMaps: CfWorkerSourceMap[] | undefined;
	dependencies: Record<string, { bytesInOutput: number }>;
	resolvedEntryPointPath: string;
	bundleType: CfModuleType;
	content: string;
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
