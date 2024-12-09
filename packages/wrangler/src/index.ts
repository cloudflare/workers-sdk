import module from "node:module";
import os from "node:os";
import { setTimeout } from "node:timers/promises";
import TOML from "@iarna/toml";
import chalk from "chalk";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import makeCLI from "yargs";
import { version as wranglerVersion } from "../package.json";
import { ai } from "./ai";
import { cloudchamber } from "./cloudchamber";
import {
	configFileName,
	findWranglerConfig,
	formatConfigSnippet,
	loadDotEnv,
	readRawConfig,
} from "./config";
import { demandSingleValue } from "./core";
import { CommandRegistry } from "./core/CommandRegistry";
import { createRegisterYargsCommand } from "./core/register-yargs-command";
import { d1 } from "./d1";
import { deleteHandler, deleteOptions } from "./delete";
import { deployHandler, deployOptions } from "./deploy";
import { isAuthenticationError } from "./deploy/deploy";
import {
	isBuildFailure,
	isBuildFailureFromCause,
} from "./deployment-bundle/build-failures";
import {
	commonDeploymentCMDSetup,
	deployments,
	rollbackDeployment,
	viewDeployment,
} from "./deployments";
import {
	buildHandler,
	buildOptions,
	configHandler,
	noOpOptions,
	previewHandler,
	previewOptions,
	route,
	routeHandler,
	subdomainHandler,
	subdomainOptions,
} from "./deprecated";
import { dev } from "./dev";
import { workerNamespaceCommands } from "./dispatch-namespace";
import { docs } from "./docs";
import {
	CommandLineArgsError,
	JsonFriendlyFatalError,
	UserError,
} from "./errors";
import { generateHandler, generateOptions } from "./generate";
import { hyperdrive } from "./hyperdrive/index";
import { initHandler, initOptions } from "./init";
import {
	kvBulkAlias,
	kvBulkDeleteCommand,
	kvBulkNamespace,
	kvBulkPutCommand,
	kvKeyAlias,
	kvKeyDeleteCommand,
	kvKeyGetCommand,
	kvKeyListCommand,
	kvKeyNamespace,
	kvKeyPutCommand,
	kvNamespace,
	kvNamespaceAlias,
	kvNamespaceCreateCommand,
	kvNamespaceDeleteCommand,
	kvNamespaceListCommand,
	kvNamespaceNamespace,
} from "./kv";
import { logBuildFailure, logger, LOGGER_LEVELS } from "./logger";
import { getMetricsDispatcher } from "./metrics";
import {
	metricsAlias,
	telemetryDisableCommand,
	telemetryEnableCommand,
	telemetryNamespace,
	telemetryStatusCommand,
} from "./metrics/commands";
import { mTlsCertificateCommands } from "./mtls-certificate/cli";
import { writeOutput } from "./output";
import { pages } from "./pages";
import { APIError, formatMessage, ParseError } from "./parse";
import { pipelines } from "./pipelines";
import { pubSubCommands } from "./pubsub/pubsub-commands";
import { queues } from "./queues/cli/commands";
import { r2Namespace } from "./r2";
import {
	r2BucketCreateCommand,
	r2BucketDeleteCommand,
	r2BucketInfoCommand,
	r2BucketListCommand,
	r2BucketNamespace,
	r2BucketUpdateNamespace,
	r2BucketUpdateStorageClassCommand,
} from "./r2/bucket";
import {
	r2BucketDomainAddCommand,
	r2BucketDomainListCommand,
	r2BucketDomainNamespace,
	r2BucketDomainRemoveCommand,
	r2BucketDomainUpdateCommand,
} from "./r2/domain";
import {
	r2BucketLifecycleAddCommand,
	r2BucketLifecycleListCommand,
	r2BucketLifecycleNamespace,
	r2BucketLifecycleRemoveCommand,
	r2BucketLifecycleSetCommand,
} from "./r2/lifecycle";
import {
	r2BucketNotificationCreateCommand,
	r2BucketNotificationDeleteCommand,
	r2BucketNotificationGetAlias,
	r2BucketNotificationListCommand,
	r2BucketNotificationNamespace,
} from "./r2/notification";
import {
	r2ObjectDeleteCommand,
	r2ObjectGetCommand,
	r2ObjectNamespace,
	r2ObjectPutCommand,
} from "./r2/object";
import {
	r2BucketDevUrlDisableCommand,
	r2BucketDevUrlEnableCommand,
	r2BucketDevUrlGetCommand,
	r2BucketDevUrlNamespace,
} from "./r2/public-dev-url";
import {
	r2BucketSippyDisableCommand,
	r2BucketSippyEnableCommand,
	r2BucketSippyGetCommand,
	r2BucketSippyNamespace,
} from "./r2/sippy";
import { secret, secretBulkHandler, secretBulkOptions } from "./secret";
import {
	addBreadcrumb,
	captureGlobalException,
	closeSentry,
	setupSentry,
} from "./sentry";
import { tailHandler, tailOptions } from "./tail";
import registerTriggersSubcommands from "./triggers";
import { typesHandler, typesOptions } from "./type-generation";
import { printWranglerBanner, updateCheck } from "./update-check";
import { getAuthFromEnv } from "./user";
import { loginCommand, logoutCommand, whoamiCommand } from "./user/commands";
import { whoami } from "./user/whoami";
import { debugLogFilepath } from "./utils/log-file";
import { vectorize } from "./vectorize/index";
import { versionsNamespace } from "./versions";
import { versionsDeployCommand } from "./versions/deploy";
import registerVersionsDeploymentsSubcommands from "./versions/deployments";
import { versionsListCommand } from "./versions/list";
import registerVersionsRollbackCommand from "./versions/rollback";
import { versionsSecretNamespace } from "./versions/secrets";
import { versionsSecretBulkCommand } from "./versions/secrets/bulk";
import { versionsSecretDeleteCommand } from "./versions/secrets/delete";
import { versionsSecretsListCommand } from "./versions/secrets/list";
import { versionsSecretPutCommand } from "./versions/secrets/put";
import { versionsUploadCommand } from "./versions/upload";
import { versionsViewCommand } from "./versions/view";
import { workflowsInstanceNamespace, workflowsNamespace } from "./workflows";
import { workflowsDeleteCommand } from "./workflows/commands/delete";
import { workflowsDescribeCommand } from "./workflows/commands/describe";
import { workflowsInstancesDescribeCommand } from "./workflows/commands/instances/describe";
import { workflowsInstancesListCommand } from "./workflows/commands/instances/list";
import { workflowsInstancesPauseCommand } from "./workflows/commands/instances/pause";
import { workflowsInstancesResumeCommand } from "./workflows/commands/instances/resume";
import { workflowsInstancesTerminateCommand } from "./workflows/commands/instances/terminate";
import { workflowsListCommand } from "./workflows/commands/list";
import { workflowsTriggerCommand } from "./workflows/commands/trigger";
import { asJson } from "./yargs-types";
import type { Config } from "./config";
import type { LoggerLevel } from "./logger";
import type { CommonYargsArgv, SubHelp } from "./yargs-types";

const resetColor = "\x1b[0m";
const fgGreenColor = "\x1b[32m";
export const betaCmdColor = "#BD5B08";

export const DEFAULT_LOCAL_PORT = 8787;
export const DEFAULT_INSPECTOR_PORT = 9229;
export const proxy =
	process.env.https_proxy ||
	process.env.HTTPS_PROXY ||
	process.env.http_proxy ||
	process.env.HTTP_PROXY ||
	undefined;

if (proxy) {
	setGlobalDispatcher(new ProxyAgent(proxy));
	logger.log(
		`Proxy environment variables detected. We'll use your proxy for fetch requests.`
	);
}

export function getRules(config: Config): Config["rules"] {
	const rules = config.rules ?? config.build?.upload?.rules ?? [];

	if (config.rules && config.build?.upload?.rules) {
		throw new UserError(
			`You cannot configure both [rules] and [build.upload.rules] in your ${configFileName(config.configPath)} file. Delete the \`build.upload\` section.`
		);
	}

	if (config.build?.upload?.rules) {
		logger.warn(
			`Deprecation: The \`build.upload.rules\` config field is no longer used, the rules should be specified via the \`rules\` config field. Delete the \`build.upload\` field from the configuration file, and add this:

${TOML.stringify({ rules: config.build.upload.rules })}`
		);
	}
	return rules;
}

export function isLegacyEnv(config: Config): boolean {
	// We only read from config here, because we've already accounted for
	// args["legacy-env"] in https://github.com/cloudflare/workers-sdk/blob/b24aeb5722370c2e04bce97a84a1fa1e55725d79/packages/wrangler/src/config/validation.ts#L94-L98
	return config.legacy_env;
}

export function getScriptName(
	args: { name: string | undefined; env: string | undefined },
	config: Config
): string | undefined {
	if (args.name && isLegacyEnv(config) && args.env) {
		throw new CommandLineArgsError(
			`In legacy environment mode you cannot use --name and --env together. If you want to specify a Worker name for a specific environment you can add the following to your ${configFileName(config.configPath)} file:\n` +
				formatConfigSnippet(
					{
						env: {
							[args.env]: {
								name: args.name,
							},
						},
					},
					config.configPath
				)
		);
	}

	return args.name ?? config.name;
}

/**
 * Alternative to the getScriptName() because special Legacy cases allowed
 * "name", and "env" together in Wrangler v1
 */
export function getLegacyScriptName(
	args: { name: string | undefined; env: string | undefined },
	config: Config
) {
	return args.name && args.env && isLegacyEnv(config)
		? `${args.name}-${args.env}`
		: args.name ?? config.name;
}

export function createCLIParser(argv: string[]) {
	const experimentalGradualRollouts =
		// original flag -- using internal product name (Gradual Rollouts) -- kept for temp back-compat
		!argv.includes("--no-experimental-gradual-rollouts") &&
		// new flag -- using external product name (Versions)
		!argv.includes("--no-experimental-versions") &&
		// new flag -- shorthand
		!argv.includes("--no-x-versions");

	// Type check result against CommonYargsOptions to make sure we've included
	// all common options
	const wrangler: CommonYargsArgv = makeCLI(argv)
		.strict()
		// We handle errors ourselves in a try-catch around `yargs.parse`.
		// If you want the "help info" to be displayed then throw an instance of `CommandLineArgsError`.
		// Otherwise we just log the error that was thrown without any "help info".
		.showHelpOnFail(false)
		.fail((msg, error) => {
			if (!error || error.name === "YError") {
				// If there is no error or the error is a "YError", then this came from yargs own validation
				// Wrap it in a `CommandLineArgsError` so that we can handle it appropriately further up.
				error = new CommandLineArgsError(msg);
			}
			throw error;
		})
		.scriptName("wrangler")
		.wrap(null)
		.locale("en_US")
		// Define global options here, so they get included in the `Argv` type of
		// the `wrangler` variable
		.version(false)
		.option("v", {
			describe: "Show version number",
			alias: "version",
			type: "boolean",
		})
		.option("config", {
			alias: "c",
			describe: "Path to Wrangler configuration file",
			type: "string",
			requiresArg: true,
		})
		.check(
			demandSingleValue("config", (configArgv) => configArgv["_"][0] === "dev")
		)
		.option("env", {
			alias: "e",
			describe: "Environment to use for operations and .env files",
			type: "string",
			requiresArg: true,
		})
		.check(demandSingleValue("env"))
		.option("experimental-json-config", {
			alias: "j",
			describe: `Support wrangler.json.`,
			type: "boolean",
			default: true,
			deprecated: true,
			hidden: true,
		})
		.check((args) => {
			if (args["experimental-json-config"] === false) {
				throw new CommandLineArgsError(
					`Wrangler now supports wrangler.json configuration files by default and ignores the value of the \`--experimental-json-config\` flag.`
				);
			}
			return true;
		})
		.option("experimental-versions", {
			describe: `Experimental: support Worker Versions`,
			type: "boolean",
			default: true,
			hidden: true,
			alias: ["x-versions", "experimental-gradual-rollouts"],
		})
		.check((args) => {
			// Grab locally specified env params from `.env` file
			const loaded = loadDotEnv(".env", args.env);
			for (const [key, value] of Object.entries(loaded?.parsed ?? {})) {
				if (!(key in process.env)) {
					process.env[key] = value;
				}
			}

			// Write a session entry to the output file (if there is one).
			writeOutput({
				type: "wrangler-session",
				version: 1,
				wrangler_version: wranglerVersion,
				command_line_args: argv,
				log_file_path: debugLogFilepath,
			});

			return true;
		})
		.option("experimental-provision", {
			describe: `Experimental: Enable automatic resource provisioning`,
			type: "boolean",
			hidden: true,
			alias: ["x-provision"],
		})
		.epilogue(
			`Please report any issues to ${chalk.hex("#3B818D")(
				"https://github.com/cloudflare/workers-sdk/issues/new/choose"
			)}`
		);

	wrangler.updateStrings({
		"Commands:": `${chalk.bold("COMMANDS")}`,
		"Options:": `${chalk.bold("OPTIONS")}`,
		"Positionals:": `${chalk.bold("POSITIONALS")}`,
		"Examples:": `${chalk.bold("EXAMPLES")}`,
	});
	wrangler.group(
		["config", "env", "help", "version"],
		`${chalk.bold("GLOBAL FLAGS")}`
	);
	wrangler.help("help", "Show help").alias("h", "help");

	// Default help command that supports the subcommands
	const subHelp: SubHelp = {
		command: ["*"],
		handler: async (args) => {
			setImmediate(() =>
				wrangler.parse([...args._.map((a) => `${a}`), "--help"])
			);
		},
	};
	wrangler.command(
		["*"],
		false,
		() => {},
		async (args) => {
			if (args._.length > 0) {
				throw new CommandLineArgsError(`Unknown command: ${args._}.`);
			} else {
				// args.v will exist and be true in the case that no command is called, and the -v
				// option is present. This is to allow for running asynchronous printWranglerBanner
				// in the version command.
				if (args.v) {
					if (process.stdout.isTTY) {
						await printWranglerBanner();
					} else {
						logger.log(wranglerVersion);
					}
				} else {
					wrangler.showHelp("log");
				}
			}
		}
	);

	const registerCommand = createRegisterYargsCommand(wrangler, subHelp);
	const registry = new CommandRegistry(registerCommand);

	/*
	 * You will note that we use the form for all commands where we use the builder function
	 * to define options and subcommands.
	 * Further we return the result of this builder even though it's not completely necessary.
	 * The reason is that it's required for type inference of the args in the handle function.
	 * I wish we could enforce this pattern, but this comment will have to do for now.
	 * (It's also annoying that choices[] doesn't get inferred as an enum. 🤷‍♂.)
	 */
	/*
	 * TODO: Implement proper command grouping if yargs will ever support it
	 * (see https://github.com/yargs/yargs/issues/684)
	 * Until then, use a new line in the command description whenever we want
	 * to create some logical spacing between commands. This is hacky but
	 * ¯\_(ツ)_/¯
	 */
	/******************************************************/
	/*                 WRANGLER COMMANDS                  */
	/******************************************************/
	// docs
	registry.define([
		{
			command: "wrangler docs",
			definition: docs,
		},
	]);
	registry.registerNamespace("docs");

	/******************** CMD GROUP ***********************/
	// init
	wrangler.command(
		"init [name]",
		"📥 Initialize a basic Worker",
		initOptions,
		initHandler
	);

	registry.define([
		{
			command: "wrangler dev",
			definition: dev,
		},
	]);
	registry.registerNamespace("dev");

	// deploy
	wrangler.command(
		["deploy [script]", "publish [script]"],
		"🆙 Deploy a Worker to Cloudflare",
		deployOptions,
		deployHandler
	);

	// deployments
	const deploymentsDescription =
		"🚢 List and view the current and past deployments for your Worker";

	if (experimentalGradualRollouts) {
		wrangler.command(
			"deployments",
			deploymentsDescription,
			registerVersionsDeploymentsSubcommands
		);
	} else {
		wrangler.command("deployments", deploymentsDescription, (yargs) =>
			yargs
				.option("name", {
					describe: "The name of your Worker",
					type: "string",
				})
				.command(
					"list",
					"Displays the 10 most recent deployments for a Worker",
					async (listYargs) => listYargs,
					async (listYargs) => {
						const { accountId, scriptName, config } =
							await commonDeploymentCMDSetup(listYargs);
						await deployments(accountId, scriptName, config);
					}
				)
				.command(
					"view [deployment-id]",
					"View a deployment",
					async (viewYargs) =>
						viewYargs.positional("deployment-id", {
							describe: "The ID of the deployment you want to inspect",
							type: "string",
							demandOption: false,
						}),
					async (viewYargs) => {
						const { accountId, scriptName, config } =
							await commonDeploymentCMDSetup(viewYargs);

						await viewDeployment(
							accountId,
							scriptName,
							config,
							viewYargs.deploymentId
						);
					}
				)
				.command(subHelp)
		);
	}

	// rollback
	const rollbackDescription = "🔙 Rollback a deployment for a Worker";

	if (experimentalGradualRollouts) {
		registerVersionsRollbackCommand(wrangler, rollbackDescription);
	} else {
		wrangler.command(
			"rollback [deployment-id]",
			rollbackDescription,
			(rollbackYargs) =>
				rollbackYargs
					.positional("deployment-id", {
						describe: "The ID of the deployment to rollback to",
						type: "string",
						demandOption: false,
					})
					.option("message", {
						alias: "m",
						describe:
							"Skip confirmation and message prompts, uses provided argument as message",
						type: "string",
						default: undefined,
					})
					.option("name", {
						describe: "The name of your Worker",
						type: "string",
					}),
			async (rollbackYargs) => {
				const { accountId, scriptName, config } =
					await commonDeploymentCMDSetup(rollbackYargs);

				await rollbackDeployment(
					accountId,
					scriptName,
					config,
					rollbackYargs.deploymentId,
					rollbackYargs.message
				);
			}
		);
	}

	// versions
	if (experimentalGradualRollouts) {
		registry.define([
			{
				command: "wrangler versions",
				definition: versionsNamespace,
			},
			{
				command: "wrangler versions view",
				definition: versionsViewCommand,
			},
			{
				command: "wrangler versions list",
				definition: versionsListCommand,
			},
			{
				command: "wrangler versions upload",
				definition: versionsUploadCommand,
			},
			{
				command: "wrangler versions deploy",
				definition: versionsDeployCommand,
			},
			{
				command: "wrangler versions secret",
				definition: versionsSecretNamespace,
			},
			{
				command: "wrangler versions secret put",
				definition: versionsSecretPutCommand,
			},
			{
				command: "wrangler versions secret bulk",
				definition: versionsSecretBulkCommand,
			},
			{
				command: "wrangler versions secret delete",
				definition: versionsSecretDeleteCommand,
			},
			{
				command: "wrangler versions secret list",
				definition: versionsSecretsListCommand,
			},
		]);
		registry.registerNamespace("versions");
	}

	// triggers
	if (experimentalGradualRollouts) {
		wrangler.command(
			"triggers",
			"🎯 Updates the triggers of your current deployment",
			(yargs) => {
				return registerTriggersSubcommands(yargs.command(subHelp));
			}
		);
	}

	// delete
	wrangler.command(
		"delete [script]",
		"🗑  Delete a Worker from Cloudflare",
		deleteOptions,
		deleteHandler
	);

	// tail
	wrangler.command(
		"tail [worker]",
		"🦚 Start a log tailing session for a Worker",
		tailOptions,
		tailHandler
	);

	// secret
	wrangler.command(
		"secret",
		"🤫 Generate a secret that can be referenced in a Worker",
		(secretYargs) => {
			return secret(secretYargs.command(subHelp));
		}
	);

	// types
	wrangler.command(
		"types [path]",
		"📝 Generate types from bindings and module rules in configuration\n",
		typesOptions,
		typesHandler
	);

	/******************** CMD GROUP ***********************/
	registry.define([
		{ command: "wrangler kv:key", definition: kvKeyAlias },
		{ command: "wrangler kv:namespace", definition: kvNamespaceAlias },
		{ command: "wrangler kv:bulk", definition: kvBulkAlias },
		{ command: "wrangler kv", definition: kvNamespace },
		{ command: "wrangler kv namespace", definition: kvNamespaceNamespace },
		{ command: "wrangler kv key", definition: kvKeyNamespace },
		{ command: "wrangler kv bulk", definition: kvBulkNamespace },
		{
			command: "wrangler kv namespace create",
			definition: kvNamespaceCreateCommand,
		},
		{
			command: "wrangler kv namespace list",
			definition: kvNamespaceListCommand,
		},
		{
			command: "wrangler kv namespace delete",
			definition: kvNamespaceDeleteCommand,
		},
		{ command: "wrangler kv key put", definition: kvKeyPutCommand },
		{ command: "wrangler kv key list", definition: kvKeyListCommand },
		{ command: "wrangler kv key get", definition: kvKeyGetCommand },
		{ command: "wrangler kv key delete", definition: kvKeyDeleteCommand },
		{ command: "wrangler kv bulk put", definition: kvBulkPutCommand },
		{ command: "wrangler kv bulk delete", definition: kvBulkDeleteCommand },
	]);
	registry.registerNamespace("kv");

	// queues
	wrangler.command("queues", "🇶  Manage Workers Queues", (queuesYargs) => {
		return queues(queuesYargs.command(subHelp));
	});

	// r2
	registry.define([
		{ command: "wrangler r2", definition: r2Namespace },
		{
			command: "wrangler r2 object",
			definition: r2ObjectNamespace,
		},
		{
			command: "wrangler r2 object get",
			definition: r2ObjectGetCommand,
		},
		{
			command: "wrangler r2 object put",
			definition: r2ObjectPutCommand,
		},
		{
			command: "wrangler r2 object delete",
			definition: r2ObjectDeleteCommand,
		},
		{
			command: "wrangler r2 bucket",
			definition: r2BucketNamespace,
		},
		{
			command: "wrangler r2 bucket create",
			definition: r2BucketCreateCommand,
		},
		{
			command: "wrangler r2 bucket update",
			definition: r2BucketUpdateNamespace,
		},
		{
			command: "wrangler r2 bucket update storage-class",
			definition: r2BucketUpdateStorageClassCommand,
		},
		{
			command: "wrangler r2 bucket list",
			definition: r2BucketListCommand,
		},
		{
			command: "wrangler r2 bucket info",
			definition: r2BucketInfoCommand,
		},
		{
			command: "wrangler r2 bucket delete",
			definition: r2BucketDeleteCommand,
		},
		{
			command: "wrangler r2 bucket sippy",
			definition: r2BucketSippyNamespace,
		},
		{
			command: "wrangler r2 bucket sippy enable",
			definition: r2BucketSippyEnableCommand,
		},
		{
			command: "wrangler r2 bucket sippy disable",
			definition: r2BucketSippyDisableCommand,
		},
		{
			command: "wrangler r2 bucket sippy get",
			definition: r2BucketSippyGetCommand,
		},
		{
			command: "wrangler r2 bucket notification",
			definition: r2BucketNotificationNamespace,
		},
		{
			command: "wrangler r2 bucket notification get",
			definition: r2BucketNotificationGetAlias,
		},
		{
			command: "wrangler r2 bucket notification list",
			definition: r2BucketNotificationListCommand,
		},
		{
			command: "wrangler r2 bucket notification create",
			definition: r2BucketNotificationCreateCommand,
		},
		{
			command: "wrangler r2 bucket notification delete",
			definition: r2BucketNotificationDeleteCommand,
		},
		{
			command: "wrangler r2 bucket domain",
			definition: r2BucketDomainNamespace,
		},
		{
			command: "wrangler r2 bucket domain list",
			definition: r2BucketDomainListCommand,
		},
		{
			command: "wrangler r2 bucket domain add",
			definition: r2BucketDomainAddCommand,
		},
		{
			command: "wrangler r2 bucket domain remove",
			definition: r2BucketDomainRemoveCommand,
		},
		{
			command: "wrangler r2 bucket domain update",
			definition: r2BucketDomainUpdateCommand,
		},
		{
			command: "wrangler r2 bucket dev-url",
			definition: r2BucketDevUrlNamespace,
		},
		{
			command: "wrangler r2 bucket dev-url get",
			definition: r2BucketDevUrlGetCommand,
		},
		{
			command: "wrangler r2 bucket dev-url enable",
			definition: r2BucketDevUrlEnableCommand,
		},
		{
			command: "wrangler r2 bucket dev-url disable",
			definition: r2BucketDevUrlDisableCommand,
		},
		{
			command: "wrangler r2 bucket lifecycle",
			definition: r2BucketLifecycleNamespace,
		},
		{
			command: "wrangler r2 bucket lifecycle list",
			definition: r2BucketLifecycleListCommand,
		},
		{
			command: "wrangler r2 bucket lifecycle add",
			definition: r2BucketLifecycleAddCommand,
		},
		{
			command: "wrangler r2 bucket lifecycle remove",
			definition: r2BucketLifecycleRemoveCommand,
		},
		{
			command: "wrangler r2 bucket lifecycle set",
			definition: r2BucketLifecycleSetCommand,
		},
	]);
	registry.registerNamespace("r2");

	// d1
	wrangler.command("d1", `🗄  Manage Workers D1 databases`, (d1Yargs) => {
		return d1(d1Yargs.command(subHelp));
	});

	// [OPEN BETA] vectorize
	wrangler.command(
		"vectorize",
		`🧮 Manage Vectorize indexes ${chalk.hex(betaCmdColor)("[open beta]")}`,
		(vectorYargs) => {
			return vectorize(vectorYargs.command(subHelp));
		}
	);

	// hyperdrive
	wrangler.command(
		"hyperdrive",
		"🚀 Manage Hyperdrive databases",
		(hyperdriveYargs) => {
			return hyperdrive(hyperdriveYargs.command(subHelp));
		}
	);

	// pages
	wrangler.command("pages", "⚡️ Configure Cloudflare Pages", (pagesYargs) => {
		// Pages does not support the `--config`,
		// and `--env` flags, therefore hiding them from the global flags list.
		pagesYargs.hide("config").hide("env");

		return pages(pagesYargs, subHelp);
	});

	// mtls-certificate
	wrangler.command(
		"mtls-certificate",
		"🪪  Manage certificates used for mTLS connections",
		(mtlsYargs) => {
			return mTlsCertificateCommands(mtlsYargs.command(subHelp));
		}
	);

	// cloudchamber
	wrangler.command("cloudchamber", false, (cloudchamberArgs) => {
		return cloudchamber(asJson(cloudchamberArgs.command(subHelp)), subHelp);
	});

	// [PRIVATE BETA] pubsub
	wrangler.command(
		"pubsub",
		`📮 Manage Pub/Sub brokers ${chalk.hex(betaCmdColor)("[private beta]")}`,
		(pubsubYargs) => {
			return pubSubCommands(pubsubYargs, subHelp);
		}
	);

	// dispatch-namespace
	wrangler.command(
		"dispatch-namespace",
		"🏗️  Manage dispatch namespaces",
		(workerNamespaceYargs) => {
			return workerNamespaceCommands(workerNamespaceYargs, subHelp);
		}
	);

	// ai
	wrangler.command("ai", "🤖 Manage AI models", (aiYargs) => {
		return ai(aiYargs.command(subHelp));
	});

	// workflows
	registry.define([
		{
			command: "wrangler workflows",
			definition: workflowsNamespace,
		},
		{
			command: "wrangler workflows list",
			definition: workflowsListCommand,
		},
		{
			command: "wrangler workflows describe",
			definition: workflowsDescribeCommand,
		},
		{
			command: "wrangler workflows delete",
			definition: workflowsDeleteCommand,
		},
		{
			command: "wrangler workflows trigger",
			definition: workflowsTriggerCommand,
		},
		{
			command: "wrangler workflows instances",
			definition: workflowsInstanceNamespace,
		},
		{
			command: "wrangler workflows instances list",
			definition: workflowsInstancesListCommand,
		},
		{
			command: "wrangler workflows instances describe",
			definition: workflowsInstancesDescribeCommand,
		},
		{
			command: "wrangler workflows instances terminate",
			definition: workflowsInstancesTerminateCommand,
		},
		{
			command: "wrangler workflows instances pause",
			definition: workflowsInstancesPauseCommand,
		},
		{
			command: "wrangler workflows instances resume",
			definition: workflowsInstancesResumeCommand,
		},
	]);
	registry.registerNamespace("workflows");

	// pipelines
	wrangler.command("pipelines", false, (pipelinesYargs) => {
		return pipelines(pipelinesYargs.command(subHelp));
	});

	/******************** CMD GROUP ***********************/

	registry.define([
		{
			command: "wrangler login",
			definition: loginCommand,
		},
	]);
	registry.registerNamespace("login");

	registry.define([
		{
			command: "wrangler logout",
			definition: logoutCommand,
		},
	]);
	registry.registerNamespace("logout");

	registry.define([
		{
			command: "wrangler whoami",
			definition: whoamiCommand,
		},
	]);
	registry.registerNamespace("whoami");

	registry.define([
		{
			command: "wrangler telemetry",
			definition: telemetryNamespace,
		},
		{
			command: "wrangler metrics",
			definition: metricsAlias,
		},
		{
			command: "wrangler telemetry disable",
			definition: telemetryDisableCommand,
		},
		{
			command: "wrangler telemetry enable",
			definition: telemetryEnableCommand,
		},
		{
			command: "wrangler telemetry status",
			definition: telemetryStatusCommand,
		},
	]);
	registry.registerNamespace("telemetry");

	/******************************************************/
	/*               DEPRECATED COMMANDS                  */
	/******************************************************/
	// [DEPRECATED] build
	wrangler.command("build", false, buildOptions, buildHandler);

	// [DEPRECATED] config
	wrangler.command("config", false, noOpOptions, configHandler);

	// [DEPRECATED] preview
	wrangler.command(
		"preview [method] [body]",
		false,
		previewOptions,
		previewHandler
	);

	// [DEPRECATED] route
	wrangler.command(
		"route",
		false, // I think we want to hide this command
		// "➡️  List or delete worker routes",
		(routeYargs) => {
			return route(routeYargs);
		},
		routeHandler
	);

	// [DEPRECATED] subdomain
	wrangler.command(
		"subdomain [name]",
		false,
		// "👷 Create or change your workers.dev subdomain.",
		subdomainOptions,
		subdomainHandler
	);

	// [DEPRECATED] secret:bulk
	wrangler.command(
		"secret:bulk [json]",
		false,
		secretBulkOptions,
		secretBulkHandler
	);

	// [DEPRECATED] generate
	wrangler.command(
		"generate [name] [template]",
		false,
		generateOptions,
		generateHandler
	);

	// This set to false to allow overwrite of default behaviour
	wrangler.version(false);

	// [DEPRECATED] version
	wrangler.command(
		"version",
		false,
		() => {},
		async () => {
			if (process.stdout.isTTY) {
				await printWranglerBanner();
			} else {
				logger.log(wranglerVersion);
			}

			logger.warn(
				"`wrangler version` is deprecated and will be removed in a future major version. Please use `wrangler --version` instead."
			);
		}
	);

	registry.registerAll();

	wrangler.exitProcess(false);

	return wrangler;
}

export async function main(argv: string[]): Promise<void> {
	setupSentry();

	const startTime = Date.now();
	const wrangler = createCLIParser(argv);
	let command: string | undefined;
	let metricsArgs: Record<string, unknown> | undefined;
	let dispatcher: ReturnType<typeof getMetricsDispatcher> | undefined;
	// Register Yargs middleware to record command as Sentry breadcrumb
	let recordedCommand = false;
	const wranglerWithMiddleware = wrangler.middleware((args) => {
		// Update logger level, before we do any logging
		if (Object.keys(LOGGER_LEVELS).includes(args.logLevel as string)) {
			logger.loggerLevel = args.logLevel as LoggerLevel;
		}
		// Middleware called for each sub-command, but only want to record once
		if (recordedCommand) {
			return;
		}
		recordedCommand = true;
		// `args._` doesn't include any positional arguments (e.g. script name,
		// key to fetch) or flags

		try {
			const configPath = args.config ?? findWranglerConfig(process.cwd());
			const rawConfig = readRawConfig(args.config);
			dispatcher = getMetricsDispatcher({
				sendMetrics: rawConfig.send_metrics,
				configPath,
			});
		} catch (e) {
			// If we can't parse the config, we can't send metrics
			logger.debug("Failed to parse config. Disabling metrics dispatcher.", e);
		}

		command = `wrangler ${args._.join(" ")}`;
		metricsArgs = args;
		addBreadcrumb(command);
		// NB despite 'applyBeforeValidation = true', this runs *after* yargs 'validates' options,
		// e.g. if a required arg is missing, yargs will error out before we send any events :/
		dispatcher?.sendCommandEvent("wrangler command started", {
			command,
			args,
		});
	}, /* applyBeforeValidation */ true);

	let cliHandlerThrew = false;
	try {
		await wranglerWithMiddleware.parse();

		const durationMs = Date.now() - startTime;

		dispatcher?.sendCommandEvent("wrangler command completed", {
			command,
			args: metricsArgs,
			durationMs,
			durationSeconds: durationMs / 1000,
			durationMinutes: durationMs / 1000 / 60,
		});
	} catch (e) {
		cliHandlerThrew = true;
		let mayReport = true;
		let errorType: string | undefined;

		logger.log(""); // Just adds a bit of space
		if (e instanceof CommandLineArgsError) {
			logger.error(e.message);
			// We are not able to ask the `wrangler` CLI parser to show help for a subcommand programmatically.
			// The workaround is to re-run the parsing with an additional `--help` flag, which will result in the correct help message being displayed.
			// The `wrangler` object is "frozen"; we cannot reuse that with different args, so we must create a new CLI parser to generate the help message.
			await createCLIParser([...argv, "--help"]).parse();
		} else if (isAuthenticationError(e)) {
			mayReport = false;
			errorType = "AuthenticationError";
			logger.log(formatMessage(e));
			const envAuth = getAuthFromEnv();
			if (envAuth !== undefined && "apiToken" in envAuth) {
				const message =
					"📎 It looks like you are authenticating Wrangler via a custom API token set in an environment variable.\n" +
					"Please ensure it has the correct permissions for this operation.\n";
				logger.log(chalk.yellow(message));
			}
			const accountTag = (e as APIError)?.accountTag;
			await whoami(accountTag);
		} else if (e instanceof ParseError) {
			e.notes.push({
				text: "\nIf you think this is a bug, please open an issue at: https://github.com/cloudflare/workers-sdk/issues/new/choose",
			});
			logger.log(formatMessage(e));
		} else if (e instanceof JsonFriendlyFatalError) {
			logger.log(e.message);
		} else if (
			e instanceof Error &&
			e.message.includes("Raw mode is not supported on")
		) {
			// the current terminal doesn't support raw mode, which Ink needs to render
			// Ink doesn't throw a typed error or subclass or anything, so we just check the message content.
			// https://github.com/vadimdemedes/ink/blob/546fe16541fd05ad4e638d6842ca4cbe88b4092b/src/components/App.tsx#L138-L148
			mayReport = false;

			const currentPlatform = os.platform();

			const thisTerminalIsUnsupported =
				"This terminal doesn't support raw mode.";
			const soWranglerWontWork =
				"Wrangler uses raw mode to read user input and write output to the terminal, and won't function correctly without it.";
			const tryRunningItIn =
				"Try running your previous command in a terminal that supports raw mode";
			const oneOfThese =
				currentPlatform === "win32"
					? ", such as Command Prompt or Powershell."
					: currentPlatform === "darwin"
						? ", such as Terminal.app or iTerm."
						: "."; // linux user detected, hand holding disengaged.

			logger.error(
				`${thisTerminalIsUnsupported}\n${soWranglerWontWork}\n${tryRunningItIn}${oneOfThese}`
			);
		} else if (isBuildFailure(e)) {
			mayReport = false;
			errorType = "BuildFailure";

			logBuildFailure(e.errors, e.warnings);
		} else if (isBuildFailureFromCause(e)) {
			mayReport = false;
			errorType = "BuildFailure";
			logBuildFailure(e.cause.errors, e.cause.warnings);
		} else {
			let loggableException = e;
			if (
				// Is this a StartDevEnv error event? If so, unwrap the cause, which is usually the user-recognisable error
				e &&
				typeof e === "object" &&
				"type" in e &&
				e.type === "error" &&
				"cause" in e &&
				e.cause instanceof Error
			) {
				loggableException = e.cause;
			}

			logger.error(
				loggableException instanceof Error
					? loggableException.message
					: loggableException
			);
			if (loggableException instanceof Error) {
				logger.debug(loggableException.stack);
			}

			if (!(loggableException instanceof UserError)) {
				await logPossibleBugMessage();
			}
		}

		if (
			// Only report the error if we didn't just handle it
			mayReport &&
			// ...and it's not a user error
			!(e instanceof UserError) &&
			// ...and it's not an un-reportable API error
			!(e instanceof APIError && !e.reportable)
		) {
			await captureGlobalException(e);
		}

		const durationMs = Date.now() - startTime;

		dispatcher?.sendCommandEvent("wrangler command errored", {
			command,
			args: metricsArgs,
			durationMs,
			durationSeconds: durationMs / 1000,
			durationMinutes: durationMs / 1000 / 60,
			errorType:
				errorType ?? (e instanceof Error ? e.constructor.name : undefined),
		});

		throw e;
	} finally {
		try {
			// In the bootstrapper script `bin/wrangler.js`, we open an IPC channel,
			// so IPC messages from this process are propagated through the
			// bootstrapper. Normally, Node's SIGINT handler would close this for us,
			// but interactive dev mode enables raw mode on stdin which disables the
			// built-in handler. Make sure this channel is closed once it's no longer
			// needed, so we can cleanly exit. Note, we don't want to disconnect if
			// this file was imported in Vitest, as that would stop communication with
			// the test runner.
			if (typeof vitest === "undefined") {
				process.disconnect?.();
			}

			await closeSentry();
			await Promise.race([
				await Promise.allSettled(dispatcher?.requests ?? []),
				setTimeout(1000), // Ensure we don't hang indefinitely
			]);
		} catch (e) {
			logger.error(e);
			// Only re-throw if we haven't already re-thrown an exception from a
			// command handler.
			if (!cliHandlerThrew) {
				// eslint-disable-next-line no-unsafe-finally
				throw e;
			}
		}
	}
}

export function getDevCompatibilityDate(
	config: Config,
	compatibilityDate = config.compatibility_date
): string {
	// Get the maximum compatibility date supported by the installed Miniflare
	const miniflareEntry = require.resolve("miniflare");
	const miniflareRequire = module.createRequire(miniflareEntry);
	const miniflareWorkerd = miniflareRequire("workerd") as {
		compatibilityDate: string;
	};
	const currentDate = miniflareWorkerd.compatibilityDate;

	if (config.configPath !== undefined && compatibilityDate === undefined) {
		logger.warn(
			`No compatibility_date was specified. Using the installed Workers runtime's latest supported date: ${currentDate}.\n` +
				`❯❯ Add one to your ${configFileName(config.configPath)} file: compatibility_date = "${currentDate}", or\n` +
				`❯❯ Pass it in your terminal: wrangler dev [<SCRIPT>] --compatibility-date=${currentDate}\n\n` +
				"See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
		);
	}
	return compatibilityDate ?? currentDate;
}

/**
 * Write a message to the log that tells the user what they might do after we have reported an unexpected error.
 */
export async function logPossibleBugMessage() {
	logger.log(
		`${fgGreenColor}%s${resetColor}`,
		"If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose"
	);
	const latestVersion = await updateCheck();
	if (latestVersion) {
		logger.log(
			`Note that there is a newer version of Wrangler available (${latestVersion}). Consider checking whether upgrading resolves this error.`
		);
	}
}

export { printWranglerBanner };
