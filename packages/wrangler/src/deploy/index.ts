import assert from "node:assert";
import path from "node:path";
import { getAssetsOptions, validateAssetsArgsAndConfig } from "../assets";
import { configFileName, readConfig } from "../config";
import { getEntry } from "../deployment-bundle/entry";
import { UserError } from "../errors";
import { run } from "../experimental-flags";
import { logger } from "../logger";
import { verifyWorkerMatchesCITag } from "../match-tag";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { getLegacyAssetPaths, getSiteAssetPaths } from "../sites";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import { getRules } from "../utils/getRules";
import { getScriptName } from "../utils/getScriptName";
import { isLegacyEnv } from "../utils/isLegacyEnv";
import { printWranglerBanner } from "../wrangler-banner";
import deploy from "./deploy";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

async function standardPricingWarning(config: Config) {
	if (config.usage_model !== undefined) {
		logger.warn(
			`The \`usage_model\` defined in your ${configFileName(config.configPath)} file is deprecated and no longer used. Visit our developer docs for details: https://developers.cloudflare.com/workers/wrangler/configuration/#usage-model`
		);
	}
}

export function deployOptions(yargs: CommonYargsArgv) {
	return (
		yargs
			.positional("script", {
				describe: "The path to an entry point for your worker",
				type: "string",
				requiresArg: true,
			})
			.option("name", {
				describe: "Name of the worker",
				type: "string",
				requiresArg: true,
			})
			// We want to have a --no-bundle flag, but yargs requires that
			// we also have a --bundle flag (that it adds the --no to by itself)
			// So we make a --bundle flag, but hide it, and then add a --no-bundle flag
			// that's visible to the user but doesn't "do" anything.
			.option("bundle", {
				describe: "Run wrangler's compilation step before publishing",
				type: "boolean",
				hidden: true,
			})
			.option("no-bundle", {
				describe: "Skip internal build steps and directly deploy Worker",
				type: "boolean",
				default: false,
			})
			.option("outdir", {
				describe: "Output directory for the bundled worker",
				type: "string",
				requiresArg: true,
			})
			.option("compatibility-date", {
				describe: "Date to use for compatibility checks",
				type: "string",
				requiresArg: true,
			})
			.option("compatibility-flags", {
				describe: "Flags to use for compatibility checks",
				alias: "compatibility-flag",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("latest", {
				describe: "Use the latest version of the worker runtime",
				type: "boolean",
				default: false,
			})
			.option("assets", {
				describe: "Static assets to be served. Replaces Workers Sites.",
				type: "string",
				requiresArg: true,
			})
			.option("format", {
				choices: ["modules", "service-worker"] as const,
				describe: "Choose an entry type",
				deprecated: true,
				hidden: true,
			})
			.option("experimental-public", {
				describe: "(Deprecated) Static assets to be served",
				type: "string",
				requiresArg: true,
				deprecated: true,
				hidden: true,
			})
			.option("public", {
				describe: "(Deprecated) Static assets to be served",
				type: "string",
				requiresArg: true,
				deprecated: true,
				hidden: true,
			})
			.option("legacy-assets", {
				describe: "Static assets to be served",
				type: "string",
				requiresArg: true,
				deprecated: true,
				hidden: true,
			})
			.option("site", {
				describe: "Root folder of static assets for Workers Sites",
				type: "string",
				requiresArg: true,
				hidden: true,
				deprecated: true,
			})
			.option("site-include", {
				describe:
					"Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
				type: "string",
				requiresArg: true,
				array: true,
				hidden: true,
				deprecated: true,
			})
			.option("site-exclude", {
				describe:
					"Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
				type: "string",
				requiresArg: true,
				array: true,
				hidden: true,
				deprecated: true,
			})
			.option("var", {
				describe:
					"A key-value pair to be injected into the script as a variable",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("define", {
				describe: "A key-value pair to be substituted in the script",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("alias", {
				describe: "A module pair to be substituted in the script",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("triggers", {
				describe: "cron schedules to attach",
				alias: ["schedule", "schedules"],
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("routes", {
				describe: "Routes to upload",
				alias: "route",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("jsx-factory", {
				describe: "The function that is called for each JSX element",
				type: "string",
				requiresArg: true,
			})
			.option("jsx-fragment", {
				describe: "The function that is called for each JSX fragment",
				type: "string",
				requiresArg: true,
			})
			.option("tsconfig", {
				describe: "Path to a custom tsconfig.json file",
				type: "string",
				requiresArg: true,
			})
			.option("minify", {
				describe: "Minify the Worker",
				type: "boolean",
			})
			.option("node-compat", {
				describe: "Enable Node.js compatibility",
				type: "boolean",
			})
			.option("dry-run", {
				describe: "Don't actually deploy",
				type: "boolean",
			})
			.option("keep-vars", {
				describe:
					"Stop wrangler from deleting vars that are not present in the Wrangler configuration file\nBy default Wrangler will remove all vars and replace them with those found in the Wrangler configuration.\nIf your development approach is to modify vars after deployment via the dashboard you may wish to set this flag.",
				default: false,
				type: "boolean",
			})
			.option("legacy-env", {
				type: "boolean",
				describe: "Use legacy environments",
				hidden: true,
			})
			.option("logpush", {
				type: "boolean",
				describe:
					"Send Trace Events from this worker to Workers Logpush.\nThis will not configure a corresponding Logpush job automatically.",
			})
			.option("upload-source-maps", {
				type: "boolean",
				describe: "Include source maps when uploading this worker.",
			})
			.option("old-asset-ttl", {
				describe:
					"Expire old assets in given seconds rather than immediate deletion.",
				type: "number",
			})
			.option("dispatch-namespace", {
				describe:
					"Name of a dispatch namespace to deploy the Worker to (Workers for Platforms)",
				type: "string",
			})
			.option("experimental-auto-create", {
				describe: "Automatically provision draft bindings with new resources",
				type: "boolean",
				default: true,
				hidden: true,
				alias: "x-auto-create",
			})
	);
}

export type DeployArgs = StrictYargsOptionsToInterface<typeof deployOptions>;

// TODO: move this into defineCommand behaviour
export async function deployHandler(args: DeployArgs) {
	await run(
		{
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			MULTIWORKER: false,
		},
		() => deployWorker(args)
	);
}

async function deployWorker(args: DeployArgs) {
	await printWranglerBanner();

	// Check for deprecated `wrangler publish` command
	if (args._[0] === "publish") {
		logger.warn(
			"`wrangler publish` is deprecated and will be removed in the next major version.\nPlease use `wrangler deploy` instead, which accepts exactly the same arguments."
		);
	}

	if (args.legacyAssets) {
		logger.warn(
			`The --legacy-assets argument has been deprecated. Please use --assets instead.\n` +
				`To learn more about Workers with assets, visit our documentation at https://developers.cloudflare.com/workers/frameworks/.`
		);
	}

	const config = readConfig(args, { useRedirectIfAvailable: true });
	if (config.pages_build_output_dir) {
		throw new UserError(
			"It looks like you've run a Workers-specific command in a Pages project.\n" +
				"For Pages, please run `wrangler pages deploy` instead."
		);
	}
	// We use the `userConfigPath` to compute the root of a project,
	// rather than a redirected (potentially generated) `configPath`.
	const projectRoot =
		config.userConfigPath && path.dirname(config.userConfigPath);

	const entry = await getEntry(args, config, "deploy");

	if (args.public) {
		throw new UserError(
			"The --public field has been deprecated, try --legacy-assets instead."
		);
	}
	if (args.experimentalPublic) {
		throw new UserError(
			"The --experimental-public field has been deprecated, try --legacy-assets instead."
		);
	}

	if (
		(args.legacyAssets || config.legacy_assets) &&
		(args.site || config.site)
	) {
		throw new UserError(
			"Cannot use legacy assets and Workers Sites in the same Worker."
		);
	}

	if (config.workflows?.length) {
		logger.once.warn("Workflows is currently in open beta.");
	}

	validateAssetsArgsAndConfig(args, config);

	const assetsOptions = getAssetsOptions(args, config);

	if (args.latest) {
		logger.warn(
			`Using the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your ${configFileName(config.configPath)} file.`
		);
	}

	const cliVars = collectKeyValues(args.var);
	const cliDefines = collectKeyValues(args.define);
	const cliAlias = collectKeyValues(args.alias);

	const accountId = args.dryRun ? undefined : await requireAuth(config);

	const legacyAssetPaths =
		args.legacyAssets || config.legacy_assets
			? getLegacyAssetPaths(config, args.legacyAssets)
			: getSiteAssetPaths(
					config,
					args.site,
					args.siteInclude,
					args.siteExclude
				);

	if (!args.dryRun) {
		await standardPricingWarning(config);
	}

	const beforeUpload = Date.now();
	const name = getScriptName(args, config);
	assert(
		name,
		'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
	);

	if (!args.dryRun) {
		assert(accountId, "Missing account ID");
		await verifyWorkerMatchesCITag(accountId, name, config.configPath);
	}
	const { sourceMapSize, versionId, workerTag, targets } = await deploy({
		config,
		accountId,
		name,
		rules: getRules(config),
		entry,
		env: args.env,
		compatibilityDate: args.latest
			? new Date().toISOString().substring(0, 10)
			: args.compatibilityDate,
		compatibilityFlags: args.compatibilityFlags,
		vars: cliVars,
		defines: cliDefines,
		alias: cliAlias,
		triggers: args.triggers,
		jsxFactory: args.jsxFactory,
		jsxFragment: args.jsxFragment,
		tsconfig: args.tsconfig,
		routes: args.routes,
		assetsOptions,
		legacyAssetPaths,
		legacyEnv: isLegacyEnv(config),
		minify: args.minify,
		nodeCompat: args.nodeCompat,
		isWorkersSite: Boolean(args.site || config.site),
		outDir: args.outdir,
		dryRun: args.dryRun,
		noBundle: !(args.bundle ?? !config.no_bundle),
		keepVars: args.keepVars,
		logpush: args.logpush,
		uploadSourceMaps: args.uploadSourceMaps,
		oldAssetTtl: args.oldAssetTtl,
		projectRoot,
		dispatchNamespace: args.dispatchNamespace,
		experimentalAutoCreate: args.experimentalAutoCreate,
	});

	writeOutput({
		type: "deploy",
		version: 1,
		worker_name: name ?? null,
		worker_tag: workerTag,
		version_id: versionId,
		targets,
	});

	metrics.sendMetricsEvent(
		"deploy worker script",
		{
			usesTypeScript: /\.tsx?$/.test(entry.file),
			durationMs: Date.now() - beforeUpload,
			sourceMapSize,
		},
		{
			sendMetrics: config.send_metrics,
		}
	);
}
