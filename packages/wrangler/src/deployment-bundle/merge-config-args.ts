import { generatePreviewAlias } from "@cloudflare/deploy-helpers";
import {
	getCIGeneratePreviewAlias,
	getCIOverrideName,
	getTodaysCompatDate,
	getWranglerTmpDir,
	UserError,
} from "@cloudflare/workers-utils";
import { getAssetsOptions, validateAssetsArgsAndConfig } from "../assets";
import { getFlag } from "../experimental-flags";
import { logger } from "../logger";
import { getMetricsUsageHeaders } from "../metrics";
import { getSiteAssetPaths } from "../sites";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import { getScriptName } from "../utils/getScriptName";
import { useServiceEnvironmentApi } from "../utils/useServiceEnvironments";
import { getEntry } from "./entry";
import type { HandlerArgs } from "../core/types";
import type { DeployArgs } from "../deploy/index";
import type { VersionsUploadArgs } from "../versions/upload";
import type { sharedDeployVersionsArgs } from "./deploy-args";
import type {
	DeployProps,
	SharedDeployVersionsProps,
	VersionsUploadProps,
} from "@cloudflare/deploy-helpers";
import type { EphemeralDirectory } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils";

type SharedArgs = HandlerArgs<typeof sharedDeployVersionsArgs>;

async function mergeSharedConfigArgs(
	command: "deploy" | "versions upload",
	args: SharedArgs,
	config: Config
): Promise<SharedDeployVersionsProps> {
	const entry = await getEntry(args, config, command);

	validateAssetsArgsAndConfig(args, config);

	const assetsOptions = getAssetsOptions({ args, config });

	let name = getScriptName(args, config);

	const ciOverrideName = getCIOverrideName();
	if (ciOverrideName !== undefined && ciOverrideName !== name) {
		logger.warn(
			`Failed to match Worker name. Your config file is using the Worker name "${name}", but the CI system expected "${ciOverrideName}". Overriding using the CI provided Worker name. Workers Builds connected builds will attempt to open a pull request to resolve this config name mismatch.`
		);
		name = ciOverrideName;
	}

	const compatibilityDate = args.latest
		? getTodaysCompatDate()
		: (args.compatibilityDate ?? config.compatibility_date);

	const compatibilityFlags =
		args.compatibilityFlags ?? config.compatibility_flags;

	const noBundle = !(args.bundle ?? !config.no_bundle);

	const dryRun = args.dryRun ?? false;
	const accountId = dryRun ? undefined : await requireAuth(config);

	const metricsHeaders = await getMetricsUsageHeaders(config.send_metrics);
	const sendMetrics = metricsHeaders !== undefined;

	return {
		entry,
		name,
		compatibilityDate,
		compatibilityFlags,
		assetsOptions,
		jsxFactory: args.jsxFactory || config.jsx_factory,
		jsxFragment: args.jsxFragment || config.jsx_fragment,
		tsconfig: args.tsconfig ?? config.tsconfig,
		minify: args.minify ?? config.minify,
		noBundle,
		uploadSourceMaps: args.uploadSourceMaps ?? config.upload_source_maps,
		keepVars: Boolean(args.keepVars || config.keep_vars),
		isWorkersSite: Boolean(args.site || config.site),
		defines: { ...config.define, ...collectKeyValues(args.define) },
		alias: { ...config.alias, ...collectKeyValues(args.alias) },
		useServiceEnvApiPath: useServiceEnvironmentApi(args, config),
		destination: args.outdir ?? getWranglerTmpDir(entry.projectRoot, "deploy"),
		dryRun,
		env: args.env,
		outdir: args.outdir,
		outfile: args.outfile,
		tag: args.tag,
		message: args.message,
		secretsFile: args.secretsFile,
		cliVars: collectKeyValues(args.var),
		experimentalAutoCreate: args.experimentalAutoCreate,
		accountId,
		sendMetrics,
		resourcesProvision: getFlag("RESOURCES_PROVISION") ?? false,
	};
}

export async function mergeDeployConfigArgs(
	args: DeployArgs,
	config: Config
): Promise<DeployProps> {
	const shared = await mergeSharedConfigArgs("deploy", args, config);

	const domainRoutes = (args.domains || []).map((domain) => ({
		pattern: domain,
		custom_domain: true as const,
	}));
	const routes =
		args.routes ?? config.routes ?? (config.route ? [config.route] : []);

	return {
		...shared,
		command: "deploy",
		legacyAssetPaths: getSiteAssetPaths(
			config,
			args.site,
			args.siteInclude,
			args.siteExclude
		),
		triggers: args.triggers ?? config.triggers?.crons,
		routes: [...routes, ...domainRoutes],
		logpush: args.logpush !== undefined ? args.logpush : config.logpush,
		dispatchNamespace: args.dispatchNamespace,
		strict: args.strict ?? false,
		metafile: args.metafile,
		oldAssetTtl: args.oldAssetTtl,
		containersRollout: args.containersRollout,
	};
}

export async function mergeVersionsUploadConfigArgs(
	args: VersionsUploadArgs,
	config: Config
): Promise<VersionsUploadProps> {
	if (args.site || config.site) {
		throw new UserError(
			"Workers Sites does not support uploading versions through `wrangler versions upload`. You must use `wrangler deploy` instead.",
			{ telemetryMessage: "versions upload sites unsupported" }
		);
	}

	const shared = await mergeSharedConfigArgs("versions upload", args, config);

	const previewAlias =
		args.previewAlias ??
		(getCIGeneratePreviewAlias() === "true"
			? generatePreviewAlias(shared.name ?? "")
			: undefined);

	return {
		...shared,
		command: "versions upload",
		previewAlias,
	};
}

export function cleanupDestination(
	destination: string | EphemeralDirectory
): void {
	if (typeof destination !== "string") {
		destination.remove();
	}
}
