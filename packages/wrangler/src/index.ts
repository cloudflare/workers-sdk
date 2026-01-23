import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { checkMacOSVersion, setLogLevel } from "@cloudflare/cli";
import { UserError as ContainersUserError } from "@cloudflare/containers-shared/src/error";
import {
	CommandLineArgsError,
	experimental_readRawConfig,
	UserError,
} from "@cloudflare/workers-utils";
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
import {
	cloudchamberApplyCommand,
	cloudchamberBuildCommand,
	cloudchamberCreateCommand,
	cloudchamberCurlCommand,
	cloudchamberDeleteCommand,
	cloudchamberImagesDeleteCommand,
	cloudchamberImagesListCommand,
	cloudchamberImagesNamespace,
	cloudchamberListCommand,
	cloudchamberModifyCommand,
	cloudchamberNamespace,
	cloudchamberPushCommand,
	cloudchamberRegistriesConfigureCommand,
	cloudchamberRegistriesCredentialsCommand,
	cloudchamberRegistriesListCommand,
	cloudchamberRegistriesNamespace,
	cloudchamberRegistriesRemoveCommand,
	cloudchamberSshCreateCommand,
	cloudchamberSshListCommand,
	cloudchamberSshNamespace,
} from "./cloudchamber";
import { completionsCommand } from "./complete";
import { getDefaultEnvFiles, loadDotEnv } from "./config/dot-env";
import {
	containersBuildCommand,
	containersDeleteCommand,
	containersImagesDeleteCommand,
	containersImagesListCommand,
	containersImagesNamespace,
	containersInfoCommand,
	containersListCommand,
	containersNamespace,
	containersPushCommand,
	containersRegistriesConfigureCommand,
	containersRegistriesDeleteCommand,
	containersRegistriesListCommand,
	containersRegistriesNamespace,
	containersSshCommand,
} from "./containers";
import { demandSingleValue } from "./core";
import { CommandHandledError } from "./core/CommandHandledError";
import { CommandRegistry } from "./core/CommandRegistry";
import { getErrorType, handleError } from "./core/handle-errors";
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
import { logger, LOGGER_LEVELS } from "./logger";
import { allMetricsDispatchesCompleted, getMetricsDispatcher } from "./metrics";
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
import { pipelinesNamespace } from "./pipelines";
import { pipelinesCreateCommand } from "./pipelines/cli/create";
import { pipelinesDeleteCommand } from "./pipelines/cli/delete";
import { pipelinesGetCommand } from "./pipelines/cli/get";
import { pipelinesListCommand } from "./pipelines/cli/list";
import { pipelinesSetupCommand } from "./pipelines/cli/setup";
import { pipelinesSinksNamespace } from "./pipelines/cli/sinks";
import { pipelinesSinksCreateCommand } from "./pipelines/cli/sinks/create";
import { pipelinesSinksDeleteCommand } from "./pipelines/cli/sinks/delete";
import { pipelinesSinksGetCommand } from "./pipelines/cli/sinks/get";
import { pipelinesSinksListCommand } from "./pipelines/cli/sinks/list";
import { pipelinesStreamsNamespace } from "./pipelines/cli/streams";
import { pipelinesStreamsCreateCommand } from "./pipelines/cli/streams/create";
import { pipelinesStreamsDeleteCommand } from "./pipelines/cli/streams/delete";
import { pipelinesStreamsGetCommand } from "./pipelines/cli/streams/get";
import { pipelinesStreamsListCommand } from "./pipelines/cli/streams/list";
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
	r2BucketCatalogCompactionDisableCommand,
	r2BucketCatalogCompactionEnableCommand,
	r2BucketCatalogCompactionNamespace,
	r2BucketCatalogDisableCommand,
	r2BucketCatalogEnableCommand,
	r2BucketCatalogGetCommand,
	r2BucketCatalogNamespace,
	r2BucketCatalogSnapshotExpirationDisableCommand,
	r2BucketCatalogSnapshotExpirationEnableCommand,
	r2BucketCatalogSnapshotExpirationNamespace,
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
	r2BulkNamespace,
	r2BulkPutCommand,
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
import { r2SqlNamespace, r2SqlQueryCommand } from "./r2/sql";
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
import { addBreadcrumb, closeSentry, setupSentry } from "./sentry";
import { setupCommand } from "./setup";
import { tailCommand } from "./tail";
import { triggersDeployCommand, triggersNamespace } from "./triggers";
import { typesCommand } from "./type-generation";
import {
	authNamespace,
	authTokenCommand,
	loginCommand,
	logoutCommand,
	whoamiCommand,
} from "./user/commands";
import { betaCmdColor, proxy } from "./utils/constants";
import { debugLogFilepath } from "./utils/log-file";
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
import { vpcServiceCreateCommand } from "./vpc/create";
import { vpcServiceDeleteCommand } from "./vpc/delete";
import { vpcServiceGetCommand } from "./vpc/get";
import { vpcNamespace, vpcServiceNamespace } from "./vpc/index";
import { vpcServiceListCommand } from "./vpc/list";
import { vpcServiceUpdateCommand } from "./vpc/update";
import { workflowsInstanceNamespace, workflowsNamespace } from "./workflows";
import { workflowsDeleteCommand } from "./workflows/commands/delete";
import { workflowsDescribeCommand } from "./workflows/commands/describe";
import { workflowsInstancesDescribeCommand } from "./workflows/commands/instances/describe";
import { workflowsInstancesListCommand } from "./workflows/commands/instances/list";
import { workflowsInstancesPauseCommand } from "./workflows/commands/instances/pause";
import { workflowsInstancesRestartCommand } from "./workflows/commands/instances/restart";
import { workflowsInstancesResumeCommand } from "./workflows/commands/instances/resume";
import { workflowsInstancesSendEventCommand } from "./workflows/commands/instances/send-event";
import { workflowsInstancesTerminateCommand } from "./workflows/commands/instances/terminate";
import { workflowsInstancesTerminateAllCommand } from "./workflows/commands/instances/terminate-all";
import { workflowsListCommand } from "./workflows/commands/list";
import { workflowsTriggerCommand } from "./workflows/commands/trigger";
import { printWranglerBanner } from "./wrangler-banner";
import type { ReadConfigCommandArgs } from "./config";
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
		"experimental-provision": {
			describe: `Experimental: Enable automatic resource provisioning`,
			type: "boolean",
			default: true,
			hidden: true,
			alias: ["x-provision"],
		},
		"experimental-auto-create": {
			describe: "Automatically provision draft bindings with new resources",
			type: "boolean",
			default: true,
			hidden: true,
			alias: "x-auto-create",
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

	// Default help command that supports the subcommands
	const subHelp: SubHelp = {
		command: ["*"],
		handler: async (args) => {
			setImmediate(() =>
				wrangler.parse([...args._.map((a) => `${a}`), "--help"])
			);
		},
	};

	const registerCommand = createRegisterYargsCommand(wrangler, subHelp, argv);
	const registry = new CommandRegistry(registerCommand);

	// Helper to show help with command categories
	const showHelpWithCategories = async (): Promise<void> => {
		if (registry.orderedCategories.size === 0) {
			wrangler.showHelp("log");
			return;
		}

		const helpOutput = await wrangler.getHelp();
		const lines = helpOutput.split("\n");
		const commandsHeaderIndex = lines.findIndex((line) =>
			line.includes("COMMANDS")
		);
		const globalFlagsIndex = lines.findIndex((line) =>
			line.includes("GLOBAL FLAGS")
		);

		// Fallback to standard help if we can't parse
		if (commandsHeaderIndex === -1 || globalFlagsIndex === -1) {
			logger.log(helpOutput);
			return;
		}

		// Extract command lines (between `COMMANDS` header and `GLOBAL FLAGS`)
		const beforeCommands = lines.slice(0, commandsHeaderIndex + 1);
		const commandLines = lines.slice(commandsHeaderIndex + 1, globalFlagsIndex);
		const afterCommands = lines.slice(globalFlagsIndex);

		// Separate regular commands from categorized commands
		const regularCommandLines = new Array<string>();
		const categoryCommandLines = new Map<string, Array<string>>();
		for (const line of commandLines) {
			// Extract command name from line (e.g., "  wrangler r2  " -> "r2")
			const match = line.match(/^\s*wrangler\s+(\S+)/);
			if (match) {
				const cmdName = match[1];
				const [foundCategory] = Array.from(
					registry.orderedCategories.entries()
				).find(([_, commands]) => commands.includes(cmdName)) ?? [null];

				if (foundCategory) {
					const existing = categoryCommandLines.get(foundCategory) ?? [];
					existing.push(line);
					categoryCommandLines.set(foundCategory, existing);
				} else {
					regularCommandLines.push(line);
				}
			} else {
				// Empty lines or other content - keep with regular commands
				regularCommandLines.push(line);
			}
		}

		// Remove trailing empty lines from regular commands section
		const lastNonEmptyIndex = regularCommandLines.findLastIndex(
			(line) => line.trim() !== ""
		);
		const trimmedRegularCommandLines = regularCommandLines.slice(
			0,
			lastNonEmptyIndex + 1
		);

		const outputLines = [
			...beforeCommands,
			...trimmedRegularCommandLines,
		] satisfies Array<string>;
		for (const category of registry.orderedCategories.keys()) {
			const cmdLines = categoryCommandLines.get(category);
			if (!cmdLines || cmdLines.length <= 0) {
				continue;
			}

			outputLines.push(""); // Empty line before category
			outputLines.push(chalk.bold(category.toUpperCase()));

			// Sort command lines alphabetically by command name
			const sortedCmdLines = Array.from(cmdLines).sort((a, b) => {
				const matchA = a.match(/^\s*wrangler\s+(\S+)/);
				const matchB = b.match(/^\s*wrangler\s+(\S+)/);
				const cmdA = matchA ? matchA[1] : "";
				const cmdB = matchB ? matchB[1] : "";
				return cmdA.localeCompare(cmdB);
			});
			outputLines.push(...sortedCmdLines);
		}

		// Ensure empty line before `GLOBAL FLAGS` if we added categories
		if (categoryCommandLines.size > 0) {
			outputLines.push("");
		}

		outputLines.push(...afterCommands);

		logger.log(outputLines.join("\n"));
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
					await showHelpWithCategories();
				}
			}
		}
	);

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

	// completions
	registry.define([
		{
			command: "wrangler complete",
			definition: completionsCommand,
		},
	]);
	registry.registerNamespace("complete");

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
		{
			command: "wrangler setup",
			definition: setupCommand,
		},
	]);
	registry.registerNamespace("setup");

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
			command: "wrangler r2 bucket catalog compaction",
			definition: r2BucketCatalogCompactionNamespace,
		},
		{
			command: "wrangler r2 bucket catalog compaction enable",
			definition: r2BucketCatalogCompactionEnableCommand,
		},
		{
			command: "wrangler r2 bucket catalog compaction disable",
			definition: r2BucketCatalogCompactionDisableCommand,
		},
		{
			command: "wrangler r2 bucket catalog snapshot-expiration",
			definition: r2BucketCatalogSnapshotExpirationNamespace,
		},
		{
			command: "wrangler r2 bucket catalog snapshot-expiration enable",
			definition: r2BucketCatalogSnapshotExpirationEnableCommand,
		},
		{
			command: "wrangler r2 bucket catalog snapshot-expiration disable",
			definition: r2BucketCatalogSnapshotExpirationDisableCommand,
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
		{
			command: "wrangler r2 sql",
			definition: r2SqlNamespace,
		},
		{
			command: "wrangler r2 sql query",
			definition: r2SqlQueryCommand,
		},
		{
			command: "wrangler r2 bulk",
			definition: r2BulkNamespace,
		},
		{
			command: "wrangler r2 bulk put",
			definition: r2BulkPutCommand,
		},
	]);
	registry.registerNamespace("r2");

	// D1 commands are registered using the CommandRegistry
	registry.define([
		{ command: "wrangler d1", definition: d1Namespace },
		{ command: "wrangler d1 create", definition: d1CreateCommand },
		{ command: "wrangler d1 info", definition: d1InfoCommand },
		{ command: "wrangler d1 list", definition: d1ListCommand },
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
			command: "wrangler d1 migrations create",
			definition: d1MigrationsCreateCommand,
		},
		{
			command: "wrangler d1 migrations list",
			definition: d1MigrationsListCommand,
		},
		{
			command: "wrangler d1 migrations apply",
			definition: d1MigrationsApplyCommand,
		},
		{ command: "wrangler d1 insights", definition: d1InsightsCommand },
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
	registry.define([
		{ command: "wrangler cloudchamber", definition: cloudchamberNamespace },
		{
			command: "wrangler cloudchamber list",
			definition: cloudchamberListCommand,
		},
		{
			command: "wrangler cloudchamber create",
			definition: cloudchamberCreateCommand,
		},
		{
			command: "wrangler cloudchamber delete",
			definition: cloudchamberDeleteCommand,
		},
		{
			command: "wrangler cloudchamber modify",
			definition: cloudchamberModifyCommand,
		},
		{
			command: "wrangler cloudchamber apply",
			definition: cloudchamberApplyCommand,
		},
		{
			command: "wrangler cloudchamber curl",
			definition: cloudchamberCurlCommand,
		},
		{
			command: "wrangler cloudchamber build",
			definition: cloudchamberBuildCommand,
		},
		{
			command: "wrangler cloudchamber push",
			definition: cloudchamberPushCommand,
		},
		{
			command: "wrangler cloudchamber ssh",
			definition: cloudchamberSshNamespace,
		},
		{
			command: "wrangler cloudchamber ssh list",
			definition: cloudchamberSshListCommand,
		},
		{
			command: "wrangler cloudchamber ssh create",
			definition: cloudchamberSshCreateCommand,
		},
		{
			command: "wrangler cloudchamber registries",
			definition: cloudchamberRegistriesNamespace,
		},
		{
			command: "wrangler cloudchamber registries configure",
			definition: cloudchamberRegistriesConfigureCommand,
		},
		{
			command: "wrangler cloudchamber registries credentials",
			definition: cloudchamberRegistriesCredentialsCommand,
		},
		{
			command: "wrangler cloudchamber registries remove",
			definition: cloudchamberRegistriesRemoveCommand,
		},
		{
			command: "wrangler cloudchamber registries list",
			definition: cloudchamberRegistriesListCommand,
		},
		{
			command: "wrangler cloudchamber images",
			definition: cloudchamberImagesNamespace,
		},
		{
			command: "wrangler cloudchamber images list",
			definition: cloudchamberImagesListCommand,
		},
		{
			command: "wrangler cloudchamber images delete",
			definition: cloudchamberImagesDeleteCommand,
		},
	]);
	registry.registerNamespace("cloudchamber");

	// containers
	registry.define([
		{ command: "wrangler containers", definition: containersNamespace },
		{ command: "wrangler containers list", definition: containersListCommand },
		{ command: "wrangler containers info", definition: containersInfoCommand },
		{
			command: "wrangler containers delete",
			definition: containersDeleteCommand,
		},
		{ command: "wrangler containers ssh", definition: containersSshCommand },
		{
			command: "wrangler containers build",
			definition: containersBuildCommand,
		},
		{ command: "wrangler containers push", definition: containersPushCommand },
		{
			command: "wrangler containers registries",
			definition: containersRegistriesNamespace,
		},
		{
			command: "wrangler containers registries configure",
			definition: containersRegistriesConfigureCommand,
		},
		{
			command: "wrangler containers registries list",
			definition: containersRegistriesListCommand,
		},
		{
			command: "wrangler containers registries delete",
			definition: containersRegistriesDeleteCommand,
		},
		{
			command: "wrangler containers images",
			definition: containersImagesNamespace,
		},
		{
			command: "wrangler containers images list",
			definition: containersImagesListCommand,
		},
		{
			command: "wrangler containers images delete",
			definition: containersImagesDeleteCommand,
		},
	]);
	registry.registerNamespace("containers");
	registry.registerLegacyCommandCategory("containers", "Compute & AI");

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
			command: "wrangler workflows instances send-event",
			definition: workflowsInstancesSendEventCommand,
		},
		{
			command: "wrangler workflows instances terminate",
			definition: workflowsInstancesTerminateCommand,
		},
		{
			command: "wrangler workflows instances restart",
			definition: workflowsInstancesRestartCommand,
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
			command: "wrangler pipelines setup",
			definition: pipelinesSetupCommand,
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
		{
			command: "wrangler pipelines streams",
			definition: pipelinesStreamsNamespace,
		},
		{
			command: "wrangler pipelines streams create",
			definition: pipelinesStreamsCreateCommand,
		},
		{
			command: "wrangler pipelines streams list",
			definition: pipelinesStreamsListCommand,
		},
		{
			command: "wrangler pipelines streams get",
			definition: pipelinesStreamsGetCommand,
		},
		{
			command: "wrangler pipelines streams delete",
			definition: pipelinesStreamsDeleteCommand,
		},
		{
			command: "wrangler pipelines sinks",
			definition: pipelinesSinksNamespace,
		},
		{
			command: "wrangler pipelines sinks create",
			definition: pipelinesSinksCreateCommand,
		},
		{
			command: "wrangler pipelines sinks list",
			definition: pipelinesSinksListCommand,
		},
		{
			command: "wrangler pipelines sinks get",
			definition: pipelinesSinksGetCommand,
		},
		{
			command: "wrangler pipelines sinks delete",
			definition: pipelinesSinksDeleteCommand,
		},
	]);
	registry.registerNamespace("pipelines");

	registry.define([
		{ command: "wrangler vpc", definition: vpcNamespace },
		{ command: "wrangler vpc service", definition: vpcServiceNamespace },
		{
			command: "wrangler vpc service create",
			definition: vpcServiceCreateCommand,
		},
		{
			command: "wrangler vpc service delete",
			definition: vpcServiceDeleteCommand,
		},
		{
			command: "wrangler vpc service get",
			definition: vpcServiceGetCommand,
		},
		{
			command: "wrangler vpc service list",
			definition: vpcServiceListCommand,
		},
		{
			command: "wrangler vpc service update",
			definition: vpcServiceUpdateCommand,
		},
	]);
	registry.registerNamespace("vpc");

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
			command: "wrangler auth",
			definition: authNamespace,
		},
		{
			command: "wrangler auth token",
			definition: authTokenCommand,
		},
	]);
	registry.registerNamespace("auth");

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

	registry.registerLegacyCommandCategory("pubsub", "Compute & AI");

	registry.registerAll();

	wrangler.help("help", "Show help").alias("h", "help");

	wrangler.exitProcess(false);

	return { wrangler, registry, globalFlags, showHelpWithCategories };
}

export async function main(argv: string[]): Promise<void> {
	setupSentry();

	checkMacOSVersion({ shouldThrow: false });

	// Check if this is a root-level help request (--help or -h with no subcommand)
	// In this case, we use our custom help formatter to show command categories
	const isRootHelpRequest =
		(argv.includes("--help") || argv.includes("-h")) &&
		argv.filter((arg) => !arg.startsWith("-")).length === 0;

	const { wrangler, showHelpWithCategories } = createCLIParser(argv);

	if (isRootHelpRequest) {
		await showHelpWithCategories();
		return;
	}

	// Register Yargs middleware to record command as Sentry breadcrumb and set logger level
	let recordedCommand = false;
	const wranglerWithMiddleware = wrangler.middleware((args) => {
		// Update logger level, before we do any logging
		if (Object.keys(LOGGER_LEVELS).includes(args.logLevel as string)) {
			logger.loggerLevel = args.logLevel as LoggerLevel;
		}
		// Also set the CLI package log level to match
		setLogLevel(logger.loggerLevel);

		// Middleware called for each sub-command, but only want to record once
		if (recordedCommand) {
			return;
		}
		recordedCommand = true;

		// Record command as Sentry breadcrumb
		const command = `wrangler ${args._.join(" ")}`;
		addBreadcrumb(command);
	}, /* applyBeforeValidation */ true);

	const startTime = Date.now();
	let command: string | undefined;
	let configArgs: ReadConfigCommandArgs = {};
	let dispatcher: ReturnType<typeof getMetricsDispatcher> | undefined;

	// Register middleware to capture command info for fallback telemetry
	const wranglerWithTelemetry = wranglerWithMiddleware.middleware((args) => {
		// Capture command and args for potential fallback telemetry
		// (used when yargs validation errors occur before handler runs)
		command = `wrangler ${args._.join(" ")}`;
		configArgs = args;

		try {
			const { rawConfig, configPath } = experimental_readRawConfig(args);
			dispatcher = getMetricsDispatcher({
				sendMetrics: rawConfig.send_metrics,
				hasAssets: !!rawConfig.assets?.directory,
				configPath,
				argv,
			});
		} catch (e) {
			// If we can't parse the config, we can still send metrics with defaults
			logger.debug("Failed to parse config for metrics. Using defaults.", e);
			dispatcher = getMetricsDispatcher({ argv });
		}
	}, /* applyBeforeValidation */ true);

	let cliHandlerThrew = false;
	try {
		await wranglerWithTelemetry.parse();
	} catch (e) {
		cliHandlerThrew = true;

		if (e instanceof CommandHandledError) {
			// This error occurred during Command handler execution,
			// and has already sent metrics and reported to the user.
			// So we can just re-throw the original error.
			throw e.originalError;
		} else {
			// The error occurred before Command handler ran
			// (e.g., yargs validation errors like unknown commands or invalid arguments).
			// So we need to handle telemetry and error reporting here.
			if (dispatcher && command) {
				dispatchGenericCommandErrorEvent(
					dispatcher,
					command,
					configArgs,
					startTime,
					e
				);
			}
			await handleError(e, configArgs, argv);
			throw e;
		}
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

			// Wait for any pending telemetry requests to complete (with timeout)
			await Promise.race([
				allMetricsDispatchesCompleted(),
				setTimeout(1000, undefined, { ref: false }),
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

/**
 * Dispatches generic metrics events to indicate that a wrangler command errored
 * when we don't know the CommandDefinition and cannot be sure what is safe to send.
 */
function dispatchGenericCommandErrorEvent(
	dispatcher: ReturnType<typeof getMetricsDispatcher>,
	command: string,
	configArgs: ReadConfigCommandArgs,
	startTime: number,
	error: unknown
) {
	const durationMs = Date.now() - startTime;

	// Send "started" event since handler never got to send it.
	dispatcher.sendCommandEvent("wrangler command started", {
		command,
		args: configArgs,
	});

	dispatcher.sendCommandEvent("wrangler command errored", {
		command,
		args: configArgs,
		durationMs,
		durationSeconds: durationMs / 1000,
		durationMinutes: durationMs / 1000 / 60,
		errorType: getErrorType(error),
		errorMessage:
			error instanceof UserError || error instanceof ContainersUserError
				? error.telemetryMessage
				: undefined,
	});
}
