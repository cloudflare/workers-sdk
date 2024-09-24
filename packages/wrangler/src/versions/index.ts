import assert from "node:assert";
import path from "node:path";
import { processAssetsArg, validateAssetsArgsAndConfig } from "../assets";
import { findWranglerToml, readConfig } from "../config";
import { getEntry } from "../deployment-bundle/entry";
import { UserError } from "../errors";
import {
	getRules,
	getScriptName,
	isLegacyEnv,
	printWranglerBanner,
} from "../index";
import { logger } from "../logger";
import { verifyWorkerMatchesCITag } from "../match-tag";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import { versionsDeployHandler, versionsDeployOptions } from "./deploy";
import { versionsListHandler, versionsListOptions } from "./list";
import { registerVersionsSecretsSubcommands } from "./secrets";
import versionsUpload from "./upload";
import { versionsViewHandler, versionsViewOptions } from "./view";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
	SubHelp,
} from "../yargs-types";

async function standardPricingWarning(config: Config) {
	if (config.usage_model !== undefined) {
		logger.warn(
			"The `usage_model` defined in wrangler.toml is deprecated and no longer used. Visit our developer docs for details: https://developers.cloudflare.com/workers/wrangler/configuration/#usage-model"
		);
	}
}

export function versionsUploadOptions(yargs: CommonYargsArgv) {
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
			.option("upload-source-maps", {
				describe:
					"Include source maps when uploading this Worker Gradual Rollouts Version.",
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
			// args only for `versions upload`, not `deploy`
			.option("tag", {
				describe: "A tag for this Worker Gradual Rollouts Version",
				type: "string",
				requiresArg: true,
			})
			.option("message", {
				describe:
					"A descriptive message for this Worker Gradual Rollouts Version",
				type: "string",
				requiresArg: true,
			})
	);
}

export async function versionsUploadHandler(
	args: StrictYargsOptionsToInterface<typeof versionsUploadOptions>
) {
	await printWranglerBanner();

	const configPath =
		args.config || (args.script && findWranglerToml(path.dirname(args.script)));
	const projectRoot = configPath && path.dirname(configPath);
	const config = readConfig(configPath, args);
	const entry = await getEntry(args, config, "versions upload");
	await metrics.sendMetricsEvent(
		"upload worker version",
		{
			usesTypeScript: /\.tsx?$/.test(entry.file),
		},
		{
			sendMetrics: config.send_metrics,
		}
	);

	if (args.site || config.site) {
		throw new UserError(
			"Workers Sites does not support uploading versions through `wrangler versions upload`. You must use `wrangler deploy` instead."
		);
	}
	if (args.legacyAssets || config.legacy_assets) {
		throw new UserError(
			"Legacy assets does not support uploading versions through `wrangler versions upload`. You must use `wrangler deploy` instead."
		);
	}

	validateAssetsArgsAndConfig(
		{
			// given that legacyAssets and sites are not supported by
			// `wrangler versions upload` pass them as undefined to
			// skip the corresponding mutual exclusivity validation
			legacyAssets: undefined,
			site: undefined,
			assets: args.assets,
			script: args.script,
		},
		config
	);

	const assetsOptions = processAssetsArg(args, config);

	if (args.latest) {
		logger.warn(
			"Using the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your wrangler.toml.\n"
		);
	}

	const cliVars = collectKeyValues(args.var);
	const cliDefines = collectKeyValues(args.define);
	const cliAlias = collectKeyValues(args.alias);

	const accountId = args.dryRun ? undefined : await requireAuth(config);
	const name = getScriptName(args, config);

	assert(
		name,
		'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
	);

	if (!args.dryRun) {
		assert(accountId, "Missing account ID");
		await verifyWorkerMatchesCITag(
			accountId,
			name,
			path.relative(entry.directory, config.configPath ?? "wrangler.toml")
		);
	}

	if (!args.dryRun) {
		await standardPricingWarning(config);
	}
	const { versionId, workerTag } = await versionsUpload({
		config,
		accountId,
		name,
		rules: getRules(config),
		entry,
		legacyEnv: isLegacyEnv(config),
		env: args.env,
		compatibilityDate: args.latest
			? new Date().toISOString().substring(0, 10)
			: args.compatibilityDate,
		compatibilityFlags: args.compatibilityFlags,
		vars: cliVars,
		defines: cliDefines,
		alias: cliAlias,
		jsxFactory: args.jsxFactory,
		jsxFragment: args.jsxFragment,
		tsconfig: args.tsconfig,
		assetsOptions,
		minify: args.minify,
		uploadSourceMaps: args.uploadSourceMaps,
		nodeCompat: args.nodeCompat,
		isWorkersSite: Boolean(args.site || config.site),
		outDir: args.outdir,
		dryRun: args.dryRun,
		noBundle: !(args.bundle ?? !config.no_bundle),
		keepVars: false,
		projectRoot,

		tag: args.tag,
		message: args.message,
	});

	writeOutput({
		type: "version-upload",
		version: 1,
		worker_name: name ?? null,
		worker_tag: workerTag,
		version_id: versionId,
	});
}

export default function registerVersionsSubcommands(
	versionYargs: CommonYargsArgv,
	subHelp: SubHelp
) {
	versionYargs
		.command(
			"view <version-id>",
			"View the details of a specific version of your Worker [beta]",
			versionsViewOptions,
			versionsViewHandler
		)
		.command(
			"list",
			"List the 10 most recent Versions of your Worker [beta]",
			versionsListOptions,
			versionsListHandler
		)
		.command(
			"upload",
			"Uploads your Worker code and config as a new Version [beta]",
			versionsUploadOptions,
			versionsUploadHandler
		)
		.command(
			"deploy [version-specs..]",
			"Safely roll out new Versions of your Worker by splitting traffic between multiple Versions [beta]",
			versionsDeployOptions,
			versionsDeployHandler
		)
		.command(
			"secret",
			"Generate a secret that can be referenced in a Worker",
			(yargs) => {
				return registerVersionsSecretsSubcommands(yargs.command(subHelp));
			}
		);
}
