import assert from "node:assert";
import os from "node:os";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { checkMacOSVersion } from "@cloudflare/cli";
import { ApiError } from "@cloudflare/containers-shared";
import chalk from "chalk";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import makeCLI from "yargs";
import { version as wranglerVersion } from "../package.json";
import { aiFineTuneNamespace, aiNamespace } from "./ai";
import { aiFineTuneCreateCommand } from "./ai/createFinetune";
import { aiModelsCommand } from "./ai/listCatalog";
import { aiFineTuneListCommand } from "./ai/listFinetune";
import { buildCommand } from "./build";
import {
	certDeleteCommand,
	certListCommand,
	certNamespace,
	certUploadCaCertCommand,
	certUploadMtlsCommand,
	certUploadNamespace,
} from "./cert/cert";
import { checkNamespace, checkStartupCommand } from "./check/commands";
import { cloudchamber } from "./cloudchamber";
import { experimental_readRawConfig, readConfig } from "./config";
import { getDefaultEnvFiles, loadDotEnv } from "./config/dot-env";
import { containers } from "./containers";
import { demandSingleValue } from "./core";
import { CommandRegistry } from "./core/CommandRegistry";
import { createRegisterYargsCommand } from "./core/register-yargs-command";
import { d1Namespace } from "./d1";
import { d1CreateCommand } from "./d1/create";
import { d1DeleteCommand } from "./d1/delete";
import { d1ExecuteCommand } from "./d1/execute";
import { d1ExportCommand } from "./d1/export";
import { d1InfoCommand } from "./d1/info";
import { d1InsightsCommand } from "./d1/insights";
import { d1ListCommand } from "./d1/list";
import { d1MigrationsNamespace } from "./d1/migrations";
import { d1MigrationsApplyCommand } from "./d1/migrations/apply";
import { d1MigrationsCreateCommand } from "./d1/migrations/create";
import { d1MigrationsListCommand } from "./d1/migrations/list";
import { d1TimeTravelNamespace } from "./d1/timeTravel";
import { d1TimeTravelInfoCommand } from "./d1/timeTravel/info";
import { d1TimeTravelRestoreCommand } from "./d1/timeTravel/restore";
import { deleteCommand } from "./delete";
import { deployCommand } from "./deploy";
import { isAuthenticationError } from "./deploy/deploy";
import {
	isBuildFailure,
	isBuildFailureFromCause,
} from "./deployment-bundle/build-failures";
import { dev } from "./dev";
import {
	dispatchNamespaceCreateCommand,
	dispatchNamespaceDeleteCommand,
	dispatchNamespaceGetCommand,
	dispatchNamespaceListCommand,
	dispatchNamespaceNamespace,
	dispatchNamespaceRenameCommand,
} from "./dispatch-namespace";
import { docs } from "./docs";
import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "./environment-variables/misc-variables";
import {
	CommandLineArgsError,
	JsonFriendlyFatalError,
	UserError,
} from "./errors";
import {
	helloWorldGetCommand,
	helloWorldNamespace,
	helloWorldSetCommand,
} from "./hello-world";
import { hyperdriveCreateCommand } from "./hyperdrive/create";
import { hyperdriveDeleteCommand } from "./hyperdrive/delete";
import { hyperdriveGetCommand } from "./hyperdrive/get";
import { hyperdriveNamespace } from "./hyperdrive/index";
import { hyperdriveListCommand } from "./hyperdrive/list";
import { hyperdriveUpdateCommand } from "./hyperdrive/update";
import { init } from "./init";
import {
	kvBulkDeleteCommand,
	kvBulkGetCommand,
	kvBulkNamespace,
	kvBulkPutCommand,
	kvKeyDeleteCommand,
	kvKeyGetCommand,
	kvKeyListCommand,
	kvKeyNamespace,
	kvKeyPutCommand,
	kvNamespace,
	kvNamespaceCreateCommand,
	kvNamespaceDeleteCommand,
	kvNamespaceListCommand,
	kvNamespaceNamespace,
	kvNamespaceRenameCommand,
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
import {
	mTlsCertificateDeleteCommand,
	mTlsCertificateListCommand,
	mTlsCertificateNamespace,
	mTlsCertificateUploadCommand,
} from "./mtls-certificate/cli";
import { writeOutput } from "./output";
import {
	pagesDeploymentNamespace,
	pagesDownloadNamespace,
	pagesFunctionsNamespace,
	pagesNamespace,
	pagesProjectNamespace,
} from "./pages";
import { pagesFunctionsBuildCommand } from "./pages/build";
import { pagesFunctionsBuildEnvCommand } from "./pages/build-env";
import {
	pagesDeployCommand,
	pagesDeploymentCreateCommand,
	pagesPublishCommand,
} from "./pages/deploy";
import { pagesDeploymentTailCommand } from "./pages/deployment-tails";
import { pagesDeploymentListCommand } from "./pages/deployments";
import { pagesDevCommand } from "./pages/dev";
import { pagesDownloadConfigCommand } from "./pages/download-config";
import { pagesFunctionsOptimizeRoutesCommand } from "./pages/functions";
import {
	pagesProjectCreateCommand,
	pagesProjectDeleteCommand,
	pagesProjectListCommand,
} from "./pages/projects";
import {
	pagesSecretBulkCommand,
	pagesSecretDeleteCommand,
	pagesSecretListCommand,
	pagesSecretNamespace,
	pagesSecretPutCommand,
} from "./pages/secret";
import { pagesProjectUploadCommand } from "./pages/upload";
import { pagesProjectValidateCommand } from "./pages/validate";
import { APIError, formatMessage, ParseError } from "./parse";
import { pipelinesNamespace } from "./pipelines";
import { pipelinesCreateCommand } from "./pipelines/cli/create";
import { pipelinesDeleteCommand } from "./pipelines/cli/delete";
import { pipelinesGetCommand } from "./pipelines/cli/get";
import { pipelinesListCommand } from "./pipelines/cli/list";
import { pipelinesUpdateCommand } from "./pipelines/cli/update";
import { pubSubCommands } from "./pubsub/pubsub-commands";
import { queuesNamespace } from "./queues/cli/commands";
import { queuesConsumerNamespace } from "./queues/cli/commands/consumer";
import { queuesConsumerHttpNamespace } from "./queues/cli/commands/consumer/http-pull";
import { queuesConsumerHttpAddCommand } from "./queues/cli/commands/consumer/http-pull/add";
import { queuesConsumerHttpRemoveCommand } from "./queues/cli/commands/consumer/http-pull/remove";
import { queuesConsumerWorkerNamespace } from "./queues/cli/commands/consumer/worker";
import { queuesConsumerAddCommand } from "./queues/cli/commands/consumer/worker/add";
import { queuesConsumerRemoveCommand } from "./queues/cli/commands/consumer/worker/remove";
import { queuesCreateCommand } from "./queues/cli/commands/create";
import { queuesDeleteCommand } from "./queues/cli/commands/delete";
import { queuesInfoCommand } from "./queues/cli/commands/info";
import { queuesListCommand } from "./queues/cli/commands/list";
import {
	queuesPauseCommand,
	queuesResumeCommand,
} from "./queues/cli/commands/pause-resume";
import { queuesPurgeCommand } from "./queues/cli/commands/purge";
import { queuesSubscriptionNamespace } from "./queues/cli/commands/subscription";
import { queuesSubscriptionCreateCommand } from "./queues/cli/commands/subscription/create";
import { queuesSubscriptionDeleteCommand } from "./queues/cli/commands/subscription/delete";
import { queuesSubscriptionGetCommand } from "./queues/cli/commands/subscription/get";
import { queuesSubscriptionListCommand } from "./queues/cli/commands/subscription/list";
import { queuesSubscriptionUpdateCommand } from "./queues/cli/commands/subscription/update";
import { queuesUpdateCommand } from "./queues/cli/commands/update";
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
	r2BucketCatalogDisableCommand,
	r2BucketCatalogEnableCommand,
	r2BucketCatalogGetCommand,
	r2BucketCatalogNamespace,
} from "./r2/catalog";
import {
	r2BucketCORSDeleteCommand,
	r2BucketCORSListCommand,
	r2BucketCORSNamespace,
	r2BucketCORSSetCommand,
} from "./r2/cors";
import {
	r2BucketDomainAddCommand,
	r2BucketDomainGetCommand,
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
	r2BucketLockAddCommand,
	r2BucketLockListCommand,
	r2BucketLockNamespace,
	r2BucketLockRemoveCommand,
	r2BucketLockSetCommand,
} from "./r2/lock";
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
import {
	secretBulkCommand,
	secretDeleteCommand,
	secretListCommand,
	secretNamespace,
	secretPutCommand,
} from "./secret";
import {
	secretsStoreNamespace,
	secretsStoreSecretNamespace,
	secretsStoreStoreNamespace,
} from "./secrets-store";
import {
	secretsStoreSecretCreateCommand,
	secretsStoreSecretDeleteCommand,
	secretsStoreSecretDuplicateCommand,
	secretsStoreSecretGetCommand,
	secretsStoreSecretListCommand,
	secretsStoreSecretUpdateCommand,
	secretsStoreStoreCreateCommand,
	secretsStoreStoreDeleteCommand,
	secretsStoreStoreListCommand,
} from "./secrets-store/commands";
import {
	addBreadcrumb,
	captureGlobalException,
	closeSentry,
	setupSentry,
} from "./sentry";
import { tailCommand } from "./tail";
import { triggersDeployCommand, triggersNamespace } from "./triggers";
import { typesCommand } from "./type-generation";
import { getAuthFromEnv } from "./user";
import { loginCommand, logoutCommand, whoamiCommand } from "./user/commands";
import { whoami } from "./user/whoami";
import { betaCmdColor, proxy } from "./utils/constants";
import { debugLogFilepath } from "./utils/log-file";
import { logPossibleBugMessage } from "./utils/logPossibleBugMessage";
import { vectorizeCreateCommand } from "./vectorize/create";
import { vectorizeCreateMetadataIndexCommand } from "./vectorize/createMetadataIndex";
import { vectorizeDeleteCommand } from "./vectorize/delete";
import { vectorizeDeleteVectorsCommand } from "./vectorize/deleteByIds";
import { vectorizeDeleteMetadataIndexCommand } from "./vectorize/deleteMetadataIndex";
import { vectorizeGetCommand } from "./vectorize/get";
import { vectorizeGetVectorsCommand } from "./vectorize/getByIds";
import { vectorizeNamespace } from "./vectorize/index";
import { vectorizeInfoCommand } from "./vectorize/info";
import { vectorizeInsertCommand } from "./vectorize/insert";
import { vectorizeListCommand } from "./vectorize/list";
import { vectorizeListMetadataIndexCommand } from "./vectorize/listMetadataIndex";
import { vectorizeListVectorsCommand } from "./vectorize/listVectors";
import { vectorizeQueryCommand } from "./vectorize/query";
import { vectorizeUpsertCommand } from "./vectorize/upsert";
import { versionsNamespace } from "./versions";
import { versionsDeployCommand } from "./versions/deploy";
import { deploymentsNamespace } from "./versions/deployments";
import { deploymentsListCommand } from "./versions/deployments/list";
import { deploymentsStatusCommand } from "./versions/deployments/status";
import { deploymentsViewCommand } from "./versions/deployments/view";
import { versionsListCommand } from "./versions/list";
import { versionsRollbackCommand } from "./versions/rollback";
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
import { workflowsInstancesTerminateAllCommand } from "./workflows/commands/instances/terminate-all";
import { workflowsListCommand } from "./workflows/commands/list";
import { workflowsTriggerCommand } from "./workflows/commands/trigger";
import { printWranglerBanner } from "./wrangler-banner";
import type { ComplianceConfig } from "./environment-variables/misc-variables";
import type { LoggerLevel } from "./logger";
import type { CommonYargsArgv, SubHelp } from "./yargs-types";

if (proxy) {
	setGlobalDispatcher(new ProxyAgent(proxy));
	logger.log(
		`Proxy environment variables detected. We'll use your proxy for fetch requests.`
	);
}

export function createCLIParser(argv: string[]) {
	const globalFlags = {
		v: {
			describe: "Show version number",
			alias: "version",
			type: "boolean",
		},
		cwd: {
			describe:
				"Run as if Wrangler was started in the specified directory instead of the current working directory",
			type: "string",
			requiresArg: true,
		},
		config: {
			alias: "c",
			describe: "Path to Wrangler configuration file",
			type: "string",
			requiresArg: true,
		},
		env: {
			alias: "e",
			describe:
				"Environment to use for operations, and for selecting .env and .dev.vars files",
			type: "string",
			requiresArg: true,
		},
		"env-file": {
			describe:
				"Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files",
			type: "string",
			array: true,
			requiresArg: true,
		},
		"experimental-remote-bindings": {
			describe: `Experimental: Enable Remote Bindings`,
			type: "boolean",
			hidden: true,
			alias: ["x-remote-bindings"],
		},
		"experimental-provision": {
			describe: `Experimental: Enable automatic resource provisioning`,
			type: "boolean",
			hidden: true,
			alias: ["x-provision"],
		},
	} as const;
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
				error = new CommandLineArgsError(msg, {
					telemetryMessage: "yargs validation error",
				});
			}
			throw error;
		})
		.scriptName("wrangler")
		.wrap(null)
		.locale("en_US")
		// Define global options here, so they get included in the `Argv` type of
		// the `wrangler` variable
		.version(false)
		.options(globalFlags)
		.check(demandSingleValue("cwd"))
		.middleware((_argv) => {
			if (_argv.cwd) {
				process.chdir(_argv.cwd);
			}
		})
		.check(
			demandSingleValue(
				"config",
				(configArgv) =>
					configArgv["_"][0] === "dev" ||
					configArgv["_"][0] === "types" ||
					(configArgv["_"][0] === "pages" && configArgv["_"][1] === "dev")
			)
		)
		.check(demandSingleValue("env"))
		.check((args) => {
			// Set process environment params from `.env` files if available.
			const resolvedEnvFilePaths = (
				args["env-file"] ?? getDefaultEnvFiles(args.env)
			).map((p) => resolve(p));
			process.env = loadDotEnv(resolvedEnvFilePaths, {
				includeProcessEnv: true,
				silent: true,
			});

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
		["config", "cwd", "env", "env-file", "help", "version"],
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

	registry.define([
		{
			command: "wrangler init",
			definition: init,
		},
	]);
	registry.registerNamespace("init");

	registry.define([
		{
			command: "wrangler dev",
			definition: dev,
		},
	]);
	registry.registerNamespace("dev");

	registry.define([
		{
			command: "wrangler deploy",
			definition: deployCommand,
		},
	]);
	registry.registerNamespace("deploy");

	registry.define([
		{ command: "wrangler deployments", definition: deploymentsNamespace },
		{
			command: "wrangler deployments list",
			definition: deploymentsListCommand,
		},
		{
			command: "wrangler deployments status",
			definition: deploymentsStatusCommand,
		},
		{
			command: "wrangler deployments view",
			definition: deploymentsViewCommand,
		},
	]);
	registry.registerNamespace("deployments");

	registry.define([
		{ command: "wrangler rollback", definition: versionsRollbackCommand },
	]);
	registry.registerNamespace("rollback");

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

	registry.define([
		{ command: "wrangler triggers", definition: triggersNamespace },
		{ command: "wrangler triggers deploy", definition: triggersDeployCommand },
	]);
	registry.registerNamespace("triggers");

	registry.define([{ command: "wrangler delete", definition: deleteCommand }]);
	registry.registerNamespace("delete");

	// tail
	registry.define([{ command: "wrangler tail", definition: tailCommand }]);
	registry.registerNamespace("tail");

	// secret
	registry.define([
		{ command: "wrangler secret", definition: secretNamespace },
		{ command: "wrangler secret put", definition: secretPutCommand },
		{ command: "wrangler secret delete", definition: secretDeleteCommand },
		{ command: "wrangler secret list", definition: secretListCommand },
		{ command: "wrangler secret bulk", definition: secretBulkCommand },
	]);
	registry.registerNamespace("secret");

	// types
	registry.define([{ command: "wrangler types", definition: typesCommand }]);
	registry.registerNamespace("types");

	/******************** CMD GROUP ***********************/
	registry.define([
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
		{
			command: "wrangler kv namespace rename",
			definition: kvNamespaceRenameCommand,
		},
		{ command: "wrangler kv key put", definition: kvKeyPutCommand },
		{ command: "wrangler kv key list", definition: kvKeyListCommand },
		{ command: "wrangler kv key get", definition: kvKeyGetCommand },
		{ command: "wrangler kv key delete", definition: kvKeyDeleteCommand },
		{ command: "wrangler kv bulk get", definition: kvBulkGetCommand },
		{ command: "wrangler kv bulk put", definition: kvBulkPutCommand },
		{ command: "wrangler kv bulk delete", definition: kvBulkDeleteCommand },
	]);
	registry.registerNamespace("kv");

	registry.define([
		{ command: "wrangler queues", definition: queuesNamespace },
		{ command: "wrangler queues list", definition: queuesListCommand },
		{ command: "wrangler queues create", definition: queuesCreateCommand },
		{ command: "wrangler queues update", definition: queuesUpdateCommand },
		{ command: "wrangler queues delete", definition: queuesDeleteCommand },
		{ command: "wrangler queues info", definition: queuesInfoCommand },
		{
			command: "wrangler queues consumer",
			definition: queuesConsumerNamespace,
		},
		{
			command: "wrangler queues pause-delivery",
			definition: queuesPauseCommand,
		},
		{
			command: "wrangler queues resume-delivery",
			definition: queuesResumeCommand,
		},
		{
			command: "wrangler queues purge",
			definition: queuesPurgeCommand,
		},
		{
			command: "wrangler queues subscription",
			definition: queuesSubscriptionNamespace,
		},
		{
			command: "wrangler queues subscription create",
			definition: queuesSubscriptionCreateCommand,
		},
		{
			command: "wrangler queues subscription list",
			definition: queuesSubscriptionListCommand,
		},
		{
			command: "wrangler queues subscription get",
			definition: queuesSubscriptionGetCommand,
		},
		{
			command: "wrangler queues subscription delete",
			definition: queuesSubscriptionDeleteCommand,
		},
		{
			command: "wrangler queues subscription update",
			definition: queuesSubscriptionUpdateCommand,
		},

		{
			command: "wrangler queues consumer add",
			definition: queuesConsumerAddCommand,
		},
		{
			command: "wrangler queues consumer remove",
			definition: queuesConsumerRemoveCommand,
		},
		{
			command: "wrangler queues consumer http",
			definition: queuesConsumerHttpNamespace,
		},
		{
			command: "wrangler queues consumer http add",
			definition: queuesConsumerHttpAddCommand,
		},
		{
			command: "wrangler queues consumer http remove",
			definition: queuesConsumerHttpRemoveCommand,
		},
		{
			command: "wrangler queues consumer worker",
			definition: queuesConsumerWorkerNamespace,
		},
		{
			command: "wrangler queues consumer worker add",
			definition: queuesConsumerAddCommand,
		},
		{
			command: "wrangler queues consumer worker remove",
			definition: queuesConsumerRemoveCommand,
		},
	]);
	registry.registerNamespace("queues");

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
			command: "wrangler r2 bucket catalog",
			definition: r2BucketCatalogNamespace,
		},
		{
			command: "wrangler r2 bucket catalog enable",
			definition: r2BucketCatalogEnableCommand,
		},
		{
			command: "wrangler r2 bucket catalog disable",
			definition: r2BucketCatalogDisableCommand,
		},
		{
			command: "wrangler r2 bucket catalog get",
			definition: r2BucketCatalogGetCommand,
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
			command: "wrangler r2 bucket domain get",
			definition: r2BucketDomainGetCommand,
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
		{
			command: "wrangler r2 bucket cors",
			definition: r2BucketCORSNamespace,
		},
		{
			command: "wrangler r2 bucket cors delete",
			definition: r2BucketCORSDeleteCommand,
		},
		{
			command: "wrangler r2 bucket cors list",
			definition: r2BucketCORSListCommand,
		},
		{
			command: "wrangler r2 bucket cors set",
			definition: r2BucketCORSSetCommand,
		},
		{
			command: "wrangler r2 bucket lock",
			definition: r2BucketLockNamespace,
		},
		{
			command: "wrangler r2 bucket lock list",
			definition: r2BucketLockListCommand,
		},
		{
			command: "wrangler r2 bucket lock add",
			definition: r2BucketLockAddCommand,
		},
		{
			command: "wrangler r2 bucket lock remove",
			definition: r2BucketLockRemoveCommand,
		},
		{
			command: "wrangler r2 bucket lock set",
			definition: r2BucketLockSetCommand,
		},
	]);
	registry.registerNamespace("r2");

	// D1 commands are registered using the CommandRegistry
	registry.define([
		{ command: "wrangler d1", definition: d1Namespace },
		{ command: "wrangler d1 list", definition: d1ListCommand },
		{ command: "wrangler d1 info", definition: d1InfoCommand },
		{ command: "wrangler d1 insights", definition: d1InsightsCommand },
		{ command: "wrangler d1 create", definition: d1CreateCommand },
		{ command: "wrangler d1 delete", definition: d1DeleteCommand },
		{ command: "wrangler d1 execute", definition: d1ExecuteCommand },
		{ command: "wrangler d1 export", definition: d1ExportCommand },
		{ command: "wrangler d1 time-travel", definition: d1TimeTravelNamespace },
		{
			command: "wrangler d1 time-travel info",
			definition: d1TimeTravelInfoCommand,
		},
		{
			command: "wrangler d1 time-travel restore",
			definition: d1TimeTravelRestoreCommand,
		},
		{ command: "wrangler d1 migrations", definition: d1MigrationsNamespace },
		{
			command: "wrangler d1 migrations list",
			definition: d1MigrationsListCommand,
		},
		{
			command: "wrangler d1 migrations create",
			definition: d1MigrationsCreateCommand,
		},
		{
			command: "wrangler d1 migrations apply",
			definition: d1MigrationsApplyCommand,
		},
	]);
	registry.registerNamespace("d1");

	// vectorize
	registry.define([
		{ command: "wrangler vectorize", definition: vectorizeNamespace },
		{
			command: "wrangler vectorize create",
			definition: vectorizeCreateCommand,
		},
		{
			command: "wrangler vectorize delete",
			definition: vectorizeDeleteCommand,
		},
		{ command: "wrangler vectorize get", definition: vectorizeGetCommand },
		{ command: "wrangler vectorize list", definition: vectorizeListCommand },
		{
			command: "wrangler vectorize list-vectors",
			definition: vectorizeListVectorsCommand,
		},
		{ command: "wrangler vectorize query", definition: vectorizeQueryCommand },
		{
			command: "wrangler vectorize insert",
			definition: vectorizeInsertCommand,
		},
		{
			command: "wrangler vectorize upsert",
			definition: vectorizeUpsertCommand,
		},
		{
			command: "wrangler vectorize get-vectors",
			definition: vectorizeGetVectorsCommand,
		},
		{
			command: "wrangler vectorize delete-vectors",
			definition: vectorizeDeleteVectorsCommand,
		},
		{ command: "wrangler vectorize info", definition: vectorizeInfoCommand },
		{
			command: "wrangler vectorize create-metadata-index",
			definition: vectorizeCreateMetadataIndexCommand,
		},
		{
			command: "wrangler vectorize list-metadata-index",
			definition: vectorizeListMetadataIndexCommand,
		},
		{
			command: "wrangler vectorize delete-metadata-index",
			definition: vectorizeDeleteMetadataIndexCommand,
		},
	]);
	registry.registerNamespace("vectorize");

	// hyperdrive
	registry.define([
		{ command: "wrangler hyperdrive", definition: hyperdriveNamespace },
		{
			command: "wrangler hyperdrive create",
			definition: hyperdriveCreateCommand,
		},
		{
			command: "wrangler hyperdrive delete",
			definition: hyperdriveDeleteCommand,
		},
		{ command: "wrangler hyperdrive get", definition: hyperdriveGetCommand },
		{ command: "wrangler hyperdrive list", definition: hyperdriveListCommand },
		{
			command: "wrangler hyperdrive update",
			definition: hyperdriveUpdateCommand,
		},
	]);
	registry.registerNamespace("hyperdrive");

	// cert - includes mtls-certificates and CA cert management
	registry.define([
		{ command: "wrangler cert", definition: certNamespace },
		{ command: "wrangler cert upload", definition: certUploadNamespace },
		{
			command: "wrangler cert upload mtls-certificate",
			definition: certUploadMtlsCommand,
		},
		{
			command: "wrangler cert upload certificate-authority",
			definition: certUploadCaCertCommand,
		},
		{ command: "wrangler cert list", definition: certListCommand },
		{ command: "wrangler cert delete", definition: certDeleteCommand },
	]);
	registry.registerNamespace("cert");

	// pages
	registry.define([
		{ command: "wrangler pages", definition: pagesNamespace },
		{ command: "wrangler pages dev", definition: pagesDevCommand },
		{
			command: "wrangler pages functions",
			definition: pagesFunctionsNamespace,
		},
		{
			command: "wrangler pages functions build",
			definition: pagesFunctionsBuildCommand,
		},
		{
			command: "wrangler pages functions build-env",
			definition: pagesFunctionsBuildEnvCommand,
		},
		{
			command: "wrangler pages functions optimize-routes",
			definition: pagesFunctionsOptimizeRoutesCommand,
		},
		{ command: "wrangler pages project", definition: pagesProjectNamespace },
		{
			command: "wrangler pages project list",
			definition: pagesProjectListCommand,
		},
		{
			command: "wrangler pages project create",
			definition: pagesProjectCreateCommand,
		},
		{
			command: "wrangler pages project delete",
			definition: pagesProjectDeleteCommand,
		},
		{
			command: "wrangler pages project upload",
			definition: pagesProjectUploadCommand,
		},
		{
			command: "wrangler pages project validate",
			definition: pagesProjectValidateCommand,
		},
		{
			command: "wrangler pages deployment",
			definition: pagesDeploymentNamespace,
		},
		{
			command: "wrangler pages deployment list",
			definition: pagesDeploymentListCommand,
		},
		{
			command: "wrangler pages deployment create",
			definition: pagesDeploymentCreateCommand,
		},
		{
			command: "wrangler pages deployment tail",
			definition: pagesDeploymentTailCommand,
		},
		{ command: "wrangler pages deploy", definition: pagesDeployCommand },
		{ command: "wrangler pages publish", definition: pagesPublishCommand },
		{ command: "wrangler pages secret", definition: pagesSecretNamespace },

		{ command: "wrangler pages download", definition: pagesDownloadNamespace },
		{
			command: "wrangler pages download config",
			definition: pagesDownloadConfigCommand,
		},
		{ command: "wrangler pages secret put", definition: pagesSecretPutCommand },
		{
			command: "wrangler pages secret bulk",
			definition: pagesSecretBulkCommand,
		},
		{
			command: "wrangler pages secret delete",
			definition: pagesSecretDeleteCommand,
		},
		{
			command: "wrangler pages secret list",
			definition: pagesSecretListCommand,
		},
	]);
	registry.registerNamespace("pages");

	registry.define([
		{
			command: "wrangler mtls-certificate",
			definition: mTlsCertificateNamespace,
		},
		{
			command: "wrangler mtls-certificate upload",
			definition: mTlsCertificateUploadCommand,
		},
		{
			command: "wrangler mtls-certificate list",
			definition: mTlsCertificateListCommand,
		},
		{
			command: "wrangler mtls-certificate delete",
			definition: mTlsCertificateDeleteCommand,
		},
	]);
	registry.registerNamespace("mtls-certificate");

	// cloudchamber
	wrangler.command("cloudchamber", false, (cloudchamberArgs) => {
		return cloudchamber(cloudchamberArgs.command(subHelp), subHelp);
	});

	// containers
	wrangler.command("containers", false, (containersArgs) => {
		return containers(containersArgs.command(subHelp), subHelp);
	});

	// [PRIVATE BETA] pubsub
	wrangler.command(
		"pubsub",
		`📮 Manage Pub/Sub brokers ${chalk.hex(betaCmdColor)("[private beta]")}`,
		(pubsubYargs) => {
			return pubSubCommands(pubsubYargs, subHelp);
		}
	);

	registry.define([
		{
			command: "wrangler dispatch-namespace",
			definition: dispatchNamespaceNamespace,
		},
		{
			command: "wrangler dispatch-namespace list",
			definition: dispatchNamespaceListCommand,
		},
		{
			command: "wrangler dispatch-namespace get",
			definition: dispatchNamespaceGetCommand,
		},
		{
			command: "wrangler dispatch-namespace create",
			definition: dispatchNamespaceCreateCommand,
		},
		{
			command: "wrangler dispatch-namespace delete",
			definition: dispatchNamespaceDeleteCommand,
		},
		{
			command: "wrangler dispatch-namespace rename",
			definition: dispatchNamespaceRenameCommand,
		},
	]);
	registry.registerNamespace("dispatch-namespace");

	// ai
	registry.define([
		{ command: "wrangler ai", definition: aiNamespace },
		{ command: "wrangler ai models", definition: aiModelsCommand },
		{ command: "wrangler ai finetune", definition: aiFineTuneNamespace },
		{ command: "wrangler ai finetune list", definition: aiFineTuneListCommand },
		{
			command: "wrangler ai finetune create",
			definition: aiFineTuneCreateCommand,
		},
	]);
	registry.registerNamespace("ai");

	// secrets store
	registry.define([
		{ command: "wrangler secrets-store", definition: secretsStoreNamespace },
		{
			command: "wrangler secrets-store store",
			definition: secretsStoreStoreNamespace,
		},
		{
			command: "wrangler secrets-store store create",
			definition: secretsStoreStoreCreateCommand,
		},
		{
			command: "wrangler secrets-store store delete",
			definition: secretsStoreStoreDeleteCommand,
		},
		{
			command: "wrangler secrets-store store list",
			definition: secretsStoreStoreListCommand,
		},
		{
			command: "wrangler secrets-store secret",
			definition: secretsStoreSecretNamespace,
		},
		{
			command: "wrangler secrets-store secret create",
			definition: secretsStoreSecretCreateCommand,
		},
		{
			command: "wrangler secrets-store secret list",
			definition: secretsStoreSecretListCommand,
		},
		{
			command: "wrangler secrets-store secret get",
			definition: secretsStoreSecretGetCommand,
		},
		{
			command: "wrangler secrets-store secret update",
			definition: secretsStoreSecretUpdateCommand,
		},
		{
			command: "wrangler secrets-store secret delete",
			definition: secretsStoreSecretDeleteCommand,
		},
		{
			command: "wrangler secrets-store secret duplicate",
			definition: secretsStoreSecretDuplicateCommand,
		},
	]);
	registry.registerNamespace("secrets-store");

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
			command: "wrangler workflows instances terminate-all",
			definition: workflowsInstancesTerminateAllCommand,
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

	registry.define([
		{
			command: "wrangler pipelines",
			definition: pipelinesNamespace,
		},
		{
			command: "wrangler pipelines create",
			definition: pipelinesCreateCommand,
		},
		{
			command: "wrangler pipelines list",
			definition: pipelinesListCommand,
		},
		{
			command: "wrangler pipelines get",
			definition: pipelinesGetCommand,
		},
		{
			command: "wrangler pipelines update",
			definition: pipelinesUpdateCommand,
		},
		{
			command: "wrangler pipelines delete",
			definition: pipelinesDeleteCommand,
		},
	]);
	registry.registerNamespace("pipelines");

	registry.define([
		{ command: "wrangler hello-world", definition: helloWorldNamespace },
		{
			command: "wrangler hello-world get",
			definition: helloWorldGetCommand,
		},
		{
			command: "wrangler hello-world set",
			definition: helloWorldSetCommand,
		},
	]);
	registry.registerNamespace("hello-world");

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

	registry.define([
		{
			command: "wrangler check",
			definition: checkNamespace,
		},
		{
			command: "wrangler check startup",
			definition: checkStartupCommand,
		},
	]);
	registry.registerNamespace("check");

	registry.define([
		{
			command: "wrangler build",
			definition: buildCommand,
		},
	]);
	registry.registerNamespace("build");

	// This set to false to allow overwrite of default behaviour
	wrangler.version(false);

	registry.registerAll();

	wrangler.exitProcess(false);

	return { wrangler, registry, globalFlags };
}

export async function main(argv: string[]): Promise<void> {
	setupSentry();

	checkMacOSVersion({ shouldThrow: false });

	const startTime = Date.now();
	const { wrangler } = createCLIParser(argv);
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
			const { rawConfig, configPath } = experimental_readRawConfig(args);
			dispatcher = getMetricsDispatcher({
				sendMetrics: rawConfig.send_metrics,
				hasAssets: !!rawConfig.assets?.directory,
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
		dispatcher?.sendCommandEvent(
			"wrangler command started",
			{
				command,
				args,
			},
			argv
		);
	}, /* applyBeforeValidation */ true);

	let cliHandlerThrew = false;
	try {
		await wranglerWithMiddleware.parse();

		const durationMs = Date.now() - startTime;

		dispatcher?.sendCommandEvent(
			"wrangler command completed",
			{
				command,
				args: metricsArgs,
				durationMs,
				durationSeconds: durationMs / 1000,
				durationMinutes: durationMs / 1000 / 60,
			},
			argv
		);
	} catch (e) {
		cliHandlerThrew = true;
		let mayReport = true;
		let errorType: string | undefined;
		let loggableException = e;

		logger.log(""); // Just adds a bit of space
		if (e instanceof CommandLineArgsError) {
			logger.error(e.message);
			// We are not able to ask the `wrangler` CLI parser to show help for a subcommand programmatically.
			// The workaround is to re-run the parsing with an additional `--help` flag, which will result in the correct help message being displayed.
			// The `wrangler` object is "frozen"; we cannot reuse that with different args, so we must create a new CLI parser to generate the help message.
			const { wrangler: helpWrangler } = createCLIParser([...argv, "--help"]);
			await helpWrangler.parse();
		} else if (
			isAuthenticationError(e) ||
			// Is this a Containers/Cloudchamber-based auth error?
			// This is different because it uses a custom OpenAPI-based generated client
			(e instanceof UserError &&
				e.cause instanceof ApiError &&
				e.cause.status === 403)
		) {
			mayReport = false;
			errorType = "AuthenticationError";
			if (e.cause instanceof ApiError) {
				logger.error(e.cause);
			} else {
				assert(isAuthenticationError(e));
				logger.log(formatMessage(e));
			}
			const envAuth = getAuthFromEnv();
			if (envAuth !== undefined && "apiToken" in envAuth) {
				const message =
					"📎 It looks like you are authenticating Wrangler via a custom API token set in an environment variable.\n" +
					"Please ensure it has the correct permissions for this operation.\n";
				logger.log(chalk.yellow(message));
			}
			const accountTag = (e as APIError)?.accountTag;
			let complianceConfig: ComplianceConfig;
			try {
				complianceConfig = await readConfig(wrangler.arguments, {
					hideWarnings: true,
				});
			} catch {
				complianceConfig = COMPLIANCE_REGION_CONFIG_UNKNOWN;
			}
			await whoami(complianceConfig, accountTag);
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
			!(loggableException instanceof UserError) &&
			// ...and it's not an un-reportable API error
			!(loggableException instanceof APIError && !loggableException.reportable)
		) {
			await captureGlobalException(loggableException);
		}
		const durationMs = Date.now() - startTime;

		dispatcher?.sendCommandEvent(
			"wrangler command errored",
			{
				command,
				args: metricsArgs,
				durationMs,
				durationSeconds: durationMs / 1000,
				durationMinutes: durationMs / 1000 / 60,
				errorType:
					errorType ?? (e instanceof Error ? e.constructor.name : undefined),
				errorMessage: e instanceof UserError ? e.telemetryMessage : undefined,
			},
			argv
		);

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
			const controller = new AbortController();

			await Promise.race([
				Promise.allSettled(dispatcher?.requests ?? []),
				setTimeout(1000, undefined, controller), // Ensure we don't hang indefinitely
			]).then(() => controller.abort()); // Ensure the Wrangler process doesn't hang waiting for setTimeout(1000) to complete
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
