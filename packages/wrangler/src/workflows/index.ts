import assert from "node:assert";
import path from "node:path";
import { fetchResult } from "../cfetch";
import { findWranglerToml, readConfig } from "../config";
import deploy from "../deploy/deploy";
import { getEntry } from "../deployment-bundle/entry";
import { UserError } from "../errors";
import { getRules, getScriptName, printWranglerBanner } from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { BuilderCallback } from "yargs";

export const workflowsCommands: BuilderCallback<CommonYargsOptions, unknown> = (
	yargs
) => {
	yargs.command("deploy", "Deploy a workflow", deployOptions, deployHandler);
};

async function standardPricingWarning(config: Config) {
	if (config.usage_model !== undefined) {
		logger.warn(
			"The `usage_model` defined in wrangler.toml is deprecated and no longer used. Visit our developer docs for details: https://developers.cloudflare.com/workers/wrangler/configuration/#usage-model"
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
			// .option("triggers", {
			// 	describe: "cron schedules to attach",
			// 	alias: ["schedule", "schedules"],
			// 	type: "string",
			// 	requiresArg: true,
			// 	array: true,
			// }) // will support later
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
			.option("dry-run", {
				describe: "Don't actually deploy",
				type: "boolean",
			})
			.option("keep-vars", {
				describe:
					"Stop wrangler from deleting vars that are not present in the wrangler.toml\nBy default Wrangler will remove all vars and replace them with those found in the wrangler.toml configuration.\nIf your development approach is to modify vars after deployment via the dashboard you may wish to set this flag.",
				default: false,
				type: "boolean",
			})
			// .option("logpush", {
			// 	type: "boolean",
			// 	describe:
			// 		"Send Trace Events from this worker to Workers Logpush.\nThis will not configure a corresponding Logpush job automatically.",
			// }) // will support later
			.option("upload-source-maps", {
				type: "boolean",
				describe: "Include source maps when uploading this worker.",
			})
	);
}

export async function deployHandler(
	args: StrictYargsOptionsToInterface<typeof deployOptions>
) {
	await printWranglerBanner();

	const configPath =
		args.config || (args.script && findWranglerToml(path.dirname(args.script)));
	const projectRoot = configPath && path.dirname(configPath);
	const config = readConfig(configPath, args);
	const entry = await getEntry(args, config, "deploy");

	if (entry.format !== "modules") {
		return doesNotSupport("service worker syntax.");
	}

	await metrics.sendMetricsEvent(
		"deploy worker script",
		{
			usesTypeScript: /\.tsx?$/.test(entry.file),
		},
		{
			sendMetrics: config.send_metrics,
		}
	);

	const disallowedKeys = [
		"pages_build_output_dir",
		"workers_dev",
		"route",
		"routes",
		"usage_model",
		"node_compat",
		"first_party_worker",
		"site",
		"config_path",
		"assets",
		"wasm_modules",
		"text_blobs",
		"data_blobs",
	];
	for (const item of disallowedKeys) {
		if (config[item as keyof Config] !== undefined) {
			return doesNotSupport(item);
		}
	}

	const futureKeys = ["logpush", "limits", "tail_consumers"];
	for (const item of futureKeys) {
		if (config[item as keyof Config] !== undefined) {
			return willSupport(item);
		}
	}

	const localKeys = [
		"ip",
		"port",
		"inspector_port",
		"local_protocol",
		"upstream_protocol",
		"host",
	];
	for (const item of localKeys) {
		if (config[item as keyof Config] !== undefined) {
			return willSupport(
				`${item}, as it doesn't currently support local mode.`
			);
		}
	}

	if (config.triggers.crons.length) {
		return willSupport("triggers.crons");
	}

	if (config.queues.consumers?.length) {
		return doesNotSupport("queues.consumers");
	}

	if (config.logfwdr.bindings.length) {
		return doesNotSupport("logfwdr");
	}

	if (config.constellation.length) {
		return doesNotSupport("constellation");
	}

	if (config.migrations.length) {
		return doesNotSupport("migrations");
	}

	if (args.experimentalVersions !== undefined) {
		return doesNotSupport("gradual deployments");
	}

	if (args.dryRun) {
		return willSupport("dryRun");
	}
	await standardPricingWarning(config); // this needs dryRun false

	if (args.latest) {
		logger.warn(
			"Using the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your wrangler.toml.\n"
		);
	}

	const cliVars = collectKeyValues(args.var);
	const cliDefines = collectKeyValues(args.define);

	const accountId = args.dryRun ? undefined : await requireAuth(config);

	const scriptName = getScriptName(args, config);
	assert(
		scriptName,
		'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
	);

	logger.info("Uploading worker script");
	const result = await deploy({
		config,
		accountId,
		name: scriptName,
		rules: getRules(config),
		entry,
		env: args.env,
		compatibilityDate: args.latest
			? new Date().toISOString().substring(0, 10)
			: args.compatibilityDate,
		compatibilityFlags: args.compatibilityFlags,
		vars: cliVars,
		defines: cliDefines,
		jsxFactory: args.jsxFactory,
		jsxFragment: args.jsxFragment,
		tsconfig: args.tsconfig,
		minify: args.minify,
		outDir: args.outdir,
		dryRun: args.dryRun,
		noBundle: !(args.bundle ?? !config.no_bundle),
		keepVars: args.keepVars,
		uploadSourceMaps: args.uploadSourceMaps,
		projectRoot,

		// not currently supporting
		assetPaths: undefined,
		triggers: undefined,
		routes: undefined,
		nodeCompat: undefined,
		legacyEnv: undefined,
		isWorkersSite: false,
		logpush: undefined,
		oldAssetTtl: undefined,
		dispatchNamespace: undefined,
		experimentalVersions: undefined,
	});

	if (!result) {
		throw new Error("Unable to get deploymentId from worker deployment.");
	}

	logger.info("Uploading workflow metadata");
	await uploadWorkflow({
		accountId: accountId as string,
		workflowName: scriptName, // will be able to be different from script name in future
		scriptName,
		deploymentId: result.deploymentId,
	});
}

function doesNotSupport(thing: string) {
	throw new UserError(`Workflows does not support ${thing}`);
}

function willSupport(thing: string) {
	throw new UserError(
		`Workflows does not currently support ${thing}, but will in the future.`
	);
}

type UploadWorkflowProps = {
	accountId: string;
	scriptName: string;
	workflowName: string;
	deploymentId: string;
};

async function uploadWorkflow(props: UploadWorkflowProps) {
	const data = await fetchResult<{
		version: {
			id: string;
		};
	}>(`/accounts/${props.accountId}/workflows/${props.workflowName}`, {
		method: "PUT",
		body: JSON.stringify({
			script_name: props.scriptName,
			script_version_id: props.deploymentId,
		}),
	});
	logger.info(
		`Successfully deployed workflow with version ID ${data.version.id}!`
	);
}
