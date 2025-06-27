import assert from "node:assert";
import path from "node:path";
import { getAssetsOptions, validateAssetsArgsAndConfig } from "../assets";
import { configFileName } from "../config";
import { createCommand } from "../core/create-command";
import { getEntry } from "../deployment-bundle/entry";
import { getCIOverrideName } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { logger } from "../logger";
import { verifyWorkerMatchesCITag } from "../match-tag";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { getSiteAssetPaths } from "../sites";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import { getRules } from "../utils/getRules";
import { getScriptName } from "../utils/getScriptName";
import { isLegacyEnv } from "../utils/isLegacyEnv";
import deploy from "./deploy";

export const deployCommand = createCommand({
	metadata: {
		description: "🆙 Deploy a Worker to Cloudflare",
		owner: "Workers: Deploy and Config",
		status: "stable",
	},
	positionalArgs: ["script"],
	args: {
		script: {
			describe: "The path to an entry point for your Worker",
			type: "string",
			requiresArg: true,
		},
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		// We want to have a --no-bundle flag, but yargs requires that
		// we also have a --bundle flag (that it adds the --no to by itself)
		// So we make a --bundle flag, but hide it, and then add a --no-bundle flag
		// that's visible to the user but doesn't "do" anything.
		bundle: {
			describe: "Run Wrangler's compilation step before publishing",
			type: "boolean",
			hidden: true,
		},
		"no-bundle": {
			describe: "Skip internal build steps and directly deploy Worker",
			type: "boolean",
			default: false,
		},
		outdir: {
			describe: "Output directory for the bundled Worker",
			type: "string",
			requiresArg: true,
		},
		outfile: {
			describe: "Output file for the bundled worker",
			type: "string",
			requiresArg: true,
		},
		"compatibility-date": {
			describe: "Date to use for compatibility checks",
			type: "string",
			requiresArg: true,
		},
		"compatibility-flags": {
			describe: "Flags to use for compatibility checks",
			alias: "compatibility-flag",
			type: "string",
			requiresArg: true,
			array: true,
		},
		latest: {
			describe: "Use the latest version of the Workers runtime",
			type: "boolean",
			default: false,
		},
		assets: {
			describe: "Static assets to be served. Replaces Workers Sites.",
			type: "string",
			requiresArg: true,
		},
		site: {
			describe: "Root folder of static assets for Workers Sites",
			type: "string",
			requiresArg: true,
			hidden: true,
			deprecated: true,
		},
		"site-include": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		"site-exclude": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		var: {
			describe: "A key-value pair to be injected into the script as a variable",
			type: "string",
			requiresArg: true,
			array: true,
		},
		define: {
			describe: "A key-value pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		alias: {
			describe: "A module pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		triggers: {
			describe: "cron schedules to attach",
			alias: ["schedule", "schedules"],
			type: "string",
			requiresArg: true,
			array: true,
		},
		routes: {
			describe: "Routes to upload",
			alias: "route",
			type: "string",
			requiresArg: true,
			array: true,
		},
		"jsx-factory": {
			describe: "The function that is called for each JSX element",
			type: "string",
			requiresArg: true,
		},
		"jsx-fragment": {
			describe: "The function that is called for each JSX fragment",
			type: "string",
			requiresArg: true,
		},
		tsconfig: {
			describe: "Path to a custom tsconfig.json file",
			type: "string",
			requiresArg: true,
		},
		minify: {
			describe: "Minify the Worker",
			type: "boolean",
		},
		"node-compat": {
			describe: "Enable Node.js compatibility",
			type: "boolean",
			hidden: true,
			deprecated: true,
		},
		"dry-run": {
			describe: "Don't actually deploy",
			type: "boolean",
		},
		metafile: {
			describe:
				"Path to output build metadata from esbuild. If flag is used without a path, defaults to 'bundle-meta.json' inside the directory specified by --outdir.",
			type: "string",
			coerce: (v: string) => (!v ? true : v),
		},
		"keep-vars": {
			describe:
				"When not used (or set to false), Wrangler will delete all vars before setting those found in the Wrangler configuration.\n" +
				"When used (and set to true), the environment variables are not deleted before the deployment.\n" +
				"If you set variables via the dashboard you probably want to use this flag.\n" +
				"Note that secrets are never deleted by deployments.",
			default: false,
			type: "boolean",
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
		logpush: {
			type: "boolean",
			describe:
				"Send Trace Events from this Worker to Workers Logpush.\nThis will not configure a corresponding Logpush job automatically.",
		},
		"upload-source-maps": {
			type: "boolean",
			describe: "Include source maps when uploading this Worker.",
		},
		"old-asset-ttl": {
			describe:
				"Expire old assets in given seconds rather than immediate deletion.",
			type: "number",
		},
		"dispatch-namespace": {
			describe:
				"Name of a dispatch namespace to deploy the Worker to (Workers for Platforms)",
			type: "string",
		},
		"experimental-auto-create": {
			describe: "Automatically provision draft bindings with new resources",
			type: "boolean",
			default: true,
			hidden: true,
			alias: "x-auto-create",
		},
	},
	behaviour: {
		useConfigRedirectIfAvailable: true,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: false,
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			REMOTE_BINDINGS: args.experimentalRemoteBindings ?? false,
		}),
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
	},
	validateArgs(args) {
		if (args.nodeCompat) {
			throw new UserError(
				`The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.`
			);
		}
	},
	async handler(args, { config }) {
		if (config.pages_build_output_dir) {
			throw new UserError(
				"It looks like you've run a Workers-specific command in a Pages project.\n" +
					"For Pages, please run `wrangler pages deploy` instead.",
				{ telemetryMessage: true }
			);
		}
		// We use the `userConfigPath` to compute the root of a project,
		// rather than a redirected (potentially generated) `configPath`.
		const projectRoot =
			config.userConfigPath && path.dirname(config.userConfigPath);

		const entry = await getEntry(args, config, "deploy");

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

		const siteAssetPaths = getSiteAssetPaths(
			config,
			args.site,
			args.siteInclude,
			args.siteExclude
		);

		const beforeUpload = Date.now();
		let name = getScriptName(args, config);

		const ciOverrideName = getCIOverrideName();
		let workerNameOverridden = false;
		if (ciOverrideName !== undefined && ciOverrideName !== name) {
			logger.warn(
				`Failed to match Worker name. Your config file is using the Worker name "${name}", but the CI system expected "${ciOverrideName}". Overriding using the CI provided Worker name. Workers Builds connected builds will attempt to open a pull request to resolve this config name mismatch.`
			);
			name = ciOverrideName;
			workerNameOverridden = true;
		}

		if (!name) {
			throw new UserError(
				'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: true }
			);
		}

		if (!args.dryRun) {
			assert(accountId, "Missing account ID");
			await verifyWorkerMatchesCITag(
				config,
				accountId,
				name,
				config.configPath
			);
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
			legacyAssetPaths: siteAssetPaths,
			legacyEnv: isLegacyEnv(config),
			minify: args.minify,
			isWorkersSite: Boolean(args.site || config.site),
			outDir: args.outdir,
			outFile: args.outfile,
			dryRun: args.dryRun,
			metafile: args.metafile,
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
			wrangler_environment: args.env,
			worker_name_overridden: workerNameOverridden,
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
	},
});

export type DeployArgs = (typeof deployCommand)["args"];
