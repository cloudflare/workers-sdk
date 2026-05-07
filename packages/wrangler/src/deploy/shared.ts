import {
	configFileName,
	formatConfigSnippet,
	getCIGeneratePreviewAlias,
	getCIOverrideName,
	getTodaysCompatDate,
	UserError,
} from "@cloudflare/workers-utils";
import {
	type AssetsOptions,
	getAssetsOptions,
	validateAssetsArgsAndConfig,
} from "../assets";
import { type Entry, getEntry } from "../deployment-bundle/entry";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import { logger } from "../logger";
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
import { validateRoutes } from "./deploy";
import type { DeployArgs } from ".";
import type { triggersDeployCommand } from "../triggers";
import type { CfPlacement, Config, Route } from "@cloudflare/workers-utils";
import type { NodeJSCompatMode } from "miniflare";

/**
 * Shared arg validation for both `wrangler deploy` and `wrangler versions upload`.
 * Called from each command's `validateArgs` hook (before config is read).
 */
export function validateArgs(args: {
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

type VersionsUploadArgs = (typeof versionsUploadCommand)["args"];
/**
 * Shared fields produced by merging CLI args with wrangler config.
 * After this point, no raw config/arg merging should happen.
 * No need to include something that is only ever derived from an arg
 */
export type SharedUploadProps = {
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
};

export type DeployProps = SharedUploadProps & {
	/** Merged from --site arg and config.site. */
	legacyAssetPaths: LegacyAssetPaths | undefined;
	/** Merged: --triggers arg ?? config.triggers.crons. */
	triggers: string[] | undefined;
	/** Merged: --routes arg ?? config.routes ?? config.route. AND --domains and custom_domains*/
	routes: Route[];
	/** Merged: --logpush arg ?? config.logpush. */
	logpush: boolean | undefined;
};

export type VersionsUploadProps = SharedUploadProps & {
	/** CLI-only (--preview-alias), or auto-generated from CI branch name. */
	previewAlias: string | undefined;
};
/**
 * Shared logic to merge CLI args with config for both `wrangler deploy` and
 * `wrangler versions upload`. Collects CLI key-value overrides, resolves
 * the worker name (with CI override), authenticates, and verifies CI tags.
 */
export async function resolveSharedConfig(
	args: DeployArgs | VersionsUploadArgs,
	config: Config,
	command: "deploy" | "versions upload"
): Promise<SharedUploadProps> {
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

	if (config.wasm_modules && entry.format === "modules") {
		throw new UserError(
			"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code",
			{ telemetryMessage: "deploy wasm modules with es module worker" }
		);
	}

	if (config.text_blobs && entry.format === "modules") {
		throw new UserError(
			`You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "[text_blobs] with an ES module worker" }
		);
	}

	if (config.data_blobs && entry.format === "modules") {
		throw new UserError(
			`You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your ${configFileName(config.configPath)} file`,
			{ telemetryMessage: "[data_blobs] with an ES module worker" }
		);
	}

	const placement = parseConfigPlacement(config);

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
	};
}

export async function resolveVersionsUploadConfig(
	args: VersionsUploadArgs,
	config: Config
): Promise<VersionsUploadProps> {
	if (args.site || config.site) {
		throw new UserError(
			"Workers Sites does not support uploading versions through `wrangler versions upload`. You must use `wrangler deploy` instead.",
			{ telemetryMessage: "versions upload sites unsupported" }
		);
	}
	const shared = await resolveSharedConfig(args, config, "versions upload");
	const previewAlias =
		args.previewAlias ??
		(getCIGeneratePreviewAlias() === "true"
			? generatePreviewAlias(shared.name)
			: undefined);

	return {
		...shared,
		previewAlias,
	};
}
/**
 * Deploy ONLY config.
 * If something is also used in versions upload or previews,
 * it should go in resolveSharedConfig()
 */
export async function resolveDeployConfig(
	args: DeployArgs,
	config: Config
): Promise<DeployProps> {
	const shared = await resolveSharedConfig(args, config, "deploy");
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

	return {
		...shared,
		routes: resolveRoutes(args, config, shared.assetsOptions),
		legacyAssetPaths: siteAssetPaths,
		logpush: args.logpush ?? config.logpush,
		triggers: resolveCronTriggers(args, config),
	};
}

/**
 * for wrangler triggers deploy - non dry-run/API calling validation and resolution
 */
export function resolveTriggersConfig(
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
