import path from "node:path";
import {
	verifyDockerInstalled,
	type ContainerNormalizedConfig,
} from "@cloudflare/containers-shared";
import {
	configFileName,
	formatConfigSnippet,
	getCIGeneratePreviewAlias,
	getCIOverrideName,
	getDockerPath,
	getTodaysCompatDate,
	UserError,
} from "@cloudflare/workers-utils";
import {
	type AssetsOptions,
	getAssetsOptions,
	validateAssetsArgsAndConfig,
} from "../assets";
import { getNormalizedContainerOptions } from "../containers/config";
import { logger } from "../logger";
import { getWranglerTmpDir } from "../paths";
import { getSiteAssetPaths, type LegacyAssetPaths } from "../sites";
import { collectKeyValues } from "../utils/collectKeyValues";
import { getRules } from "../utils/getRules";
import { getScriptName } from "../utils/getScriptName";
import { parseConfigPlacement } from "../utils/placement";
import { useServiceEnvironmentApi } from "../utils/useServiceEnvironments";
import {
	generatePreviewAlias,
	type versionsUploadCommand,
} from "../versions/upload";
import { type Entry, getEntry } from "./entry";
import { validateNodeCompatMode } from "./node-compat";
import type { DeployArgs } from "../deploy";
import type { EphemeralDirectory } from "../paths";
import type { triggersDeployCommand } from "../triggers";
import type { CfPlacement, Config, Route } from "@cloudflare/workers-utils";
import type { NodeJSCompatMode } from "miniflare";

type VersionsUploadArgs = (typeof versionsUploadCommand)["args"];
/**
 * Shared fields produced by merging CLI args with wrangler config.
 * After this point, no raw config/arg merging should happen.
 *
 * Use props for all resolved/merged values. Only access config directly
 * for raw values that aren't merged with CLI args (e.g., config.durable_objects,
 * config.unsafe, config.tail_consumers).
 */
export type SharedDeployVersionsProps = {
	config: Config;
	/** Merged from args.script/config.main/config.site.entry-point/config.assets. */
	entry: Entry;
	/** From config.rules. */
	rules: Config["rules"];
	/** Merged: --name arg ?? config.name, with CI override applied. */
	name: string;
	workerNameOverridden: boolean;
	/** Merged: --compatibility-date arg ?? config.compatibility_date. Still optional — validated as required in stage 4. */
	compatibilityDate: string | undefined;
	/** Merged: --compatibility-flags arg ?? config.compatibility_flags. */
	compatibilityFlags: string[];
	/** computed based on compat date and args */
	nodejsCompatMode: NodeJSCompatMode;
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
	placement: CfPlacement | undefined;
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
	/** From collectKeyValues(--var arg). Pre-resolved key-value pairs. */
	var: Record<string, string>;
	/** From --experimental-auto-create arg. */
	experimentalAutoCreate: boolean;
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
	containers: ContainerNormalizedConfig[];
	/** From --dispatch-namespace arg. Deploy-only (Workers for Platforms). */
	dispatchNamespace: string | undefined;
	/** From --strict arg. Deploy-only. */
	strict: boolean;
	/** From --metafile arg. Deploy-only. */
	metafile: string | boolean | undefined;
	/** From --old-asset-ttl arg. Deploy-only. */
	oldAssetTtl: number | undefined;
};

export type VersionsUploadProps = SharedDeployVersionsProps & {
	/** Discriminant for DeployProps vs VersionsUploadProps */
	command: "versions upload";
	/** CLI-only (--preview-alias), or auto-generated from CI branch name. */
	previewAlias: string | undefined;
};
/**
 * Shared arg validation for both `wrangler deploy` and `wrangler versions upload`.
 * Called from each command's `validateArgs` hook (before config is read).
 */
export function validateDeployVersionsArgs(args: {
	nodeCompat: boolean | undefined;
	latest: boolean | undefined;
	config: string | undefined;
}): void {
	if (args.nodeCompat) {
		throw new UserError(
			"The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the `nodejs_compat` compatibility flag. This includes the functionality from legacy `node_compat` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.",
			{ telemetryMessage: "deploy node compat unsupported" }
		);
	}

	if (args.latest) {
		logger.warn(
			`Using the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your ${configFileName(args.config)} file.`
		);
	}
}
/**
 * Shared logic to merge CLI args with config for both `wrangler deploy` and
 * `wrangler versions upload`.
 * Don't make API calls here. Do that later in runPreDeployValidation().
 */
export async function resolveAndValidateInput(
	args: DeployArgs | VersionsUploadArgs,
	config: Config,
	command: "deploy" | "versions upload"
): Promise<SharedDeployVersionsProps> {
	validateAssetsArgsAndConfig(args, config);
	const assetsOptions = getAssetsOptions({ args, config });

	const entry = await getEntry(args, config, command);

	/** start name stuff */
	let name = getScriptName(args, config);
	let workerNameOverridden = false;

	const ciOverrideName = getCIOverrideName();
	if (ciOverrideName !== undefined && ciOverrideName !== name) {
		logger.warn(
			`Failed to match Worker name. Your config file is using the Worker name "${name}", but the CI system expected "${ciOverrideName}". Overriding using the CI provided Worker name. Workers Builds connected builds will attempt to open a pull request to resolve this config name mismatch.`
		);
		name = ciOverrideName;
		workerNameOverridden = true;
	}

	if (!name) {
		throw new UserError(
			'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
			{ telemetryMessage: true }
		);
	}
	/** end name stuff */

	const minify = args.minify ?? config.minify;
	const noBundle = !(args.bundle ?? !config.no_bundle);
	if (noBundle && minify) {
		logger.warn(
			"`--minify` and `--no-bundle` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process."
		);
	}

	/** start compat stuff */
	const compatibilityDate = args.latest
		? getTodaysCompatDate()
		: (args.compatibilityDate ?? config.compatibility_date);

	if (!compatibilityDate) {
		const compatibilityDateStr = getTodaysCompatDate();

		throw new UserError(
			`A compatibility_date is required when publishing. Add the following to your ${configFileName(config.configPath)} file:
			\`\`\`
			${formatConfigSnippet({ compatibility_date: compatibilityDateStr }, config.configPath, false)}
			\`\`\`
			Or you could pass it in your terminal as \`--compatibility-date ${compatibilityDateStr}\`
		See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`,
			{ telemetryMessage: "missing compatibility date when deploying" }
		);
	}
	const compatibilityFlags =
		args.compatibilityFlags ?? config.compatibility_flags ?? [];
	const nodejsCompatMode = validateNodeCompatMode(
		compatibilityDate,
		compatibilityFlags,
		{
			noBundle,
		}
	);

	const placement = parseConfigPlacement(config);

	const destination =
		args.outdir ?? getWranglerTmpDir(entry.projectRoot, "deploy");

	return {
		config,
		assetsOptions,
		entry,
		name,
		workerNameOverridden,
		compatibilityDate,
		compatibilityFlags,
		nodejsCompatMode,
		noBundle,
		minify,
		placement,
		destination,
		rules: getRules(config),
		jsxFactory: args.jsxFactory || config.jsx_factory,
		jsxFragment: args.jsxFragment || config.jsx_fragment,
		tsconfig: args.tsconfig ?? config.tsconfig,

		uploadSourceMaps: args.uploadSourceMaps ?? config.upload_source_maps,
		keepVars:
			("keepVars" in args && Boolean(args.keepVars)) ||
			config.keep_vars ||
			false,
		isWorkersSite: Boolean(args.site || config.site),

		defines: { ...config.define, ...collectKeyValues(args.define) },
		alias: { ...config.alias, ...collectKeyValues(args.alias) },
		useServiceEnvApiPath: useServiceEnvironmentApi(args, config),

		dryRun: args.dryRun ?? false,
		env: args.env,
		outdir: args.outdir,
		outfile: args.outfile,
		tag: args.tag,
		message: args.message,
		secretsFile: args.secretsFile,
		var: collectKeyValues(args.var) ?? {},
		experimentalAutoCreate: args.experimentalAutoCreate ?? true,
	};
}

/**
 * Merges CLI args with config. Calls shared function with deploy and
 * also has some versions upload specific logic.
 * If something is also used in deploy, it should go in resolveAndValidateInput().
 * Don't make API calls here. Do that later in runPreDeployValidation().
 */
export async function resolveVersionsUploadInput(
	args: VersionsUploadArgs,
	config: Config
): Promise<VersionsUploadProps> {
	if (args.site || config.site) {
		throw new UserError(
			"Workers Sites does not support uploading versions through `wrangler versions upload`. You must use `wrangler deploy` instead.",
			{ telemetryMessage: "versions upload sites unsupported" }
		);
	}
	const shared = await resolveAndValidateInput(args, config, "versions upload");
	const previewAlias =
		args.previewAlias ??
		(getCIGeneratePreviewAlias() === "true"
			? generatePreviewAlias(shared.name)
			: undefined);
	if (config.containers && config.containers.length > 0) {
		logger.warn(
			`Your Worker has Containers configured. Container configuration changes (such as image, max_instances, etc.) will not be gradually rolled out with versions. These changes will only take effect after running \`wrangler deploy\`.`
		);
	}
	return {
		...shared,
		command: "versions upload",
		previewAlias,
	};
}
/**
 * Merges CLI args with config. Calls shared function with versions upload and
 * also has some deploy specific logic.
 * If something is also used in versions upload, it should go in resolveAndValidateInput().
 * Don't make API calls here. Do that later in runPreDeployValidation().
 */
export async function resolveDeployInput(
	args: DeployArgs,
	config: Config
): Promise<DeployProps> {
	const shared = await resolveAndValidateInput(args, config, "deploy");
	const siteAssetPaths = getSiteAssetPaths(
		config,
		args.site,
		args.siteInclude,
		args.siteExclude
	);
	if (config.site && !config.site.bucket) {
		throw new Error(
			"A [site] definition requires a `bucket` field with a path to the site's assets directory."
		);
	}
	if (
		!(args.site || config.site) &&
		Boolean(siteAssetPaths) &&
		shared.entry.format === "service-worker"
	) {
		throw new UserError(
			"You cannot use the service-worker format with an `assets` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/",
			{ telemetryMessage: "deploy service worker assets unsupported" }
		);
	}

	const normalisedContainerConfig = await getNormalizedContainerOptions(
		config,
		{
			containersRollout: args.containersRollout,
			dryRun: args.dryRun,
		}
	);

	if (normalisedContainerConfig.length) {
		const hasDockerfiles = normalisedContainerConfig.some(
			(container) => "dockerfile" in container
		);
		if (hasDockerfiles) {
			await verifyDockerInstalled(getDockerPath(), false);
		}
	}
	return {
		...shared,
		command: "deploy",
		routes: resolveRoutes(args, config, shared.assetsOptions),
		legacyAssetPaths: siteAssetPaths,
		logpush: args.logpush ?? config.logpush,
		triggers: resolveCronTriggers(args, config),
		containers: normalisedContainerConfig,
		dispatchNamespace: args.dispatchNamespace,
		strict: args.strict ?? false,
		metafile: args.metafile,
		oldAssetTtl: args.oldAssetTtl,
	};
}

/**
 * for wrangler triggers deploy - non dry-run/API calling validation and resolution
 */
export function resolveTriggersInput(
	args: (typeof triggersDeployCommand)["args"] & { domains?: string[] },
	config: Config
) {
	const assetsOptions = getAssetsOptions({
		args: { assets: undefined },
		config,
	});
	const scriptName = getScriptName(args, config);
	if (!scriptName) {
		throw new UserError(
			'You need to provide a name when uploading a Worker Version. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
			{ telemetryMessage: "triggers deploy missing worker name" }
		);
	}
	const useServiceEnvironments = useServiceEnvironmentApi(args, config);
	const workerName = useServiceEnvironments
		? `${scriptName} (${args.env ?? "production"})`
		: scriptName;
	return {
		crons: resolveCronTriggers(args, config),
		useServiceEnvironments,
		routes: resolveRoutes(args, config, assetsOptions) ?? [],
		scriptName,
		workerName,
	};
}

// only this needs to run in dry run
export function resolveRoutes(
	args: { routes?: string[]; domains?: string[] },
	config: Config,
	assetsOptions: AssetsOptions | undefined
): Route[] {
	const domainRoutes = (args.domains || []).map((domain) => ({
		pattern: domain,
		custom_domain: true,
	}));
	const routes =
		args.routes ?? config.routes ?? (config.route ? [config.route] : []);
	const allDeploymentRoutes = [...routes, ...domainRoutes];
	validateRoutes(allDeploymentRoutes, assetsOptions);
	return allDeploymentRoutes;
}

function resolveCronTriggers(args: { triggers?: string[] }, config: Config) {
	return args.triggers ?? config.triggers?.crons;
}

export const validateRoutes = (routes: Route[], assets?: AssetsOptions) => {
	const invalidRoutes: Record<string, string[]> = {};
	const mountedAssetRoutes: string[] = [];

	for (const route of routes) {
		if (typeof route !== "string" && route.custom_domain) {
			if (route.pattern.includes("*")) {
				invalidRoutes[route.pattern] ??= [];
				invalidRoutes[route.pattern].push(
					`Wildcard operators (*) are not allowed in Custom Domains`
				);
			}
			if (route.pattern.includes("/")) {
				invalidRoutes[route.pattern] ??= [];
				invalidRoutes[route.pattern].push(
					`Paths are not allowed in Custom Domains`
				);
			}
		} else if (
			// If we have Assets but we're not always hitting the Worker then validate
			assets?.directory !== undefined &&
			assets.routerConfig.invoke_user_worker_ahead_of_assets !== true
		) {
			const pattern = typeof route === "string" ? route : route.pattern;
			const components = pattern.split("/");

			// If this isn't `domain.com/*` then we're mounting to a path
			if (!(components.length === 2 && components[1] === "*")) {
				mountedAssetRoutes.push(pattern);
			}
		}
	}
	if (Object.keys(invalidRoutes).length > 0) {
		throw new UserError(
			`Invalid Routes:\n` +
				Object.entries(invalidRoutes)
					.map(([route, errors]) => `${route}:\n` + errors.join("\n"))
					.join(`\n\n`),
			{ telemetryMessage: "deploy invalid routes" }
		);
	}

	if (mountedAssetRoutes.length > 0 && assets?.directory !== undefined) {
		const relativeAssetsDir = path.relative(process.cwd(), assets.directory);

		logger.once.warn(
			`Warning: The following routes will attempt to serve Assets on a configured path:\n${mountedAssetRoutes
				.map((route) => {
					const routeNoScheme = route.replace(/https?:\/\//g, "");
					const assetPath = path.join(
						relativeAssetsDir,
						routeNoScheme.substring(routeNoScheme.indexOf("/"))
					);
					return `  • ${route} (Will match assets: ${assetPath})`;
				})
				.join("\n")}` +
				(assets?.routerConfig.has_user_worker
					? "\n\nRequests not matching an asset will be forwarded to the Worker's code."
					: "")
		);
	}
};
