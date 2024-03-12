import module from "node:module";
import os from "node:os";
import TOML from "@iarna/toml";
import chalk from "chalk";
import supportsColor from "supports-color";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import makeCLI from "yargs";
import { version as wranglerVersion } from "../package.json";
import { ai } from "./ai";
import { cloudchamber } from "./cloudchamber";
import { loadDotEnv, readConfig } from "./config";
import { constellation } from "./constellation";
import { d1 } from "./d1";
import { deleteHandler, deleteOptions } from "./delete";
import { deployHandler, deployOptions } from "./deploy";
import { isAuthenticationError } from "./deploy/deploy";
import { isBuildFailure } from "./deployment-bundle/build-failures";
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
import { devHandler, devOptions } from "./dev";
import { workerNamespaceCommands } from "./dispatch-namespace";
import { docsHandler, docsOptions } from "./docs";
import { JsonFriendlyFatalError, UserError } from "./errors";
import { generateHandler, generateOptions } from "./generate";
import { hyperdrive } from "./hyperdrive/index";
import { initHandler, initOptions } from "./init";
import { kvBulk, kvKey, kvNamespace } from "./kv";
import { logBuildFailure, logger, LOGGER_LEVELS } from "./logger";
import * as metrics from "./metrics";
import { mTlsCertificateCommands } from "./mtls-certificate/cli";
import { pages } from "./pages";
import { APIError, formatMessage, ParseError } from "./parse";
import { pubSubCommands } from "./pubsub/pubsub-commands";
import { queues } from "./queues/cli/commands";
import { r2 } from "./r2";
import { secret, secretBulkHandler, secretBulkOptions } from "./secret";
import {
	addBreadcrumb,
	captureGlobalException,
	closeSentry,
	setupSentry,
} from "./sentry";
import { tailHandler, tailOptions } from "./tail";
import { typesOptions, typesHandler } from "./type-generation";
import { printWranglerBanner } from "./update-check";
import {
	getAuthFromEnv,
	listScopes,
	login,
	logout,
	validateScopeKeys,
} from "./user";
import { vectorize } from "./vectorize/index";
import { versionsUploadHandler, versionsUploadOptions } from "./versions";
import { whoami } from "./whoami";
import { asJson } from "./yargs-types";
import type { Config } from "./config";
import type { LoggerLevel } from "./logger";
import type { CommonYargsArgv, CommonYargsOptions } from "./yargs-types";
import type { Arguments, CommandModule } from "yargs";

const resetColor = "\x1b[0m";
const fgGreenColor = "\x1b[32m";
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
			`You cannot configure both [rules] and [build.upload.rules] in your wrangler.toml. Delete the \`build.upload\` section.`
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
			"In legacy environment mode you cannot use --name and --env together. If you want to specify a Worker name for a specific environment you can add the following to your wrangler.toml config:" +
				`
    [env.${args.env}]
    name = "${args.name}"
    `
		);
	}

	return args.name ?? config.name;
}

/**
 * Alternative to the getScriptName() because special Legacy cases allowed "name", and "env" together in Wrangler v1
 */
export function getLegacyScriptName(
	args: { name: string | undefined; env: string | undefined },
	config: Config
) {
	return args.name && args.env && isLegacyEnv(config)
		? `${args.name}-${args.env}`
		: args.name ?? config.name;
}

// a helper to demand one of a set of options
// via https://github.com/yargs/yargs/issues/1093#issuecomment-491299261
export function demandOneOfOption(...options: string[]) {
	return function (argv: Arguments) {
		const count = options.filter((option) => argv[option]).length;
		const lastOption = options.pop();

		if (count === 0) {
			throw new CommandLineArgsError(
				`Exactly one of the arguments ${options.join(
					", "
				)} and ${lastOption} is required`
			);
		} else if (count > 1) {
			throw new CommandLineArgsError(
				`Arguments ${options.join(
					", "
				)} and ${lastOption} are mutually exclusive`
			);
		}

		return true;
	};
}

export class CommandLineArgsError extends UserError {}

const highlight = (text: string, colorHex: string) => {
	const highlightText = supportsColor.stdout ? chalk.hex(colorHex)(text) : text;

	return highlightText;
};

export function createCLIParser(argv: string[]) {
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
		// Define global options here, so they get included in the `Argv` type of
		// the `wrangler` variable
		.version(false)
		.option("v", {
			describe: "⚑Show version number",
			alias: "version",
			type: "boolean",
		})
		.option("config", {
			alias: "c",
			describe: "⚑Path to .toml configuration file",
			type: "string",
			requiresArg: true,
		})
		.option("env", {
			alias: "e",
			describe: "⚑Environment to use for operations and .env files",
			type: "string",
			requiresArg: true,
		})
		.option("experimental-json-config", {
			alias: "j",
			describe: `⚑Experimental: support wrangler.json`,
			type: "boolean",
		})
		.option("experimental-gradual-rollouts", {
			describe: `Experimental: Support Gradual Rollouts`,
			type: "boolean",
			hidden: true,
		})
		.check((args) => {
			// Update logger level, before we do any logging
			if (Object.keys(LOGGER_LEVELS).includes(args.logLevel as string)) {
				logger.loggerLevel = args.logLevel as LoggerLevel;
			}

			// Grab locally specified env params from `.env` file
			const loaded = loadDotEnv(".env", args.env);
			for (const [key, value] of Object.entries(loaded?.parsed ?? {})) {
				if (!(key in process.env)) process.env[key] = value;
			}
			return true;
		})
		.epilogue(
			`Please report any issues to ${highlight(
				"https://github.com/cloudflare/workers-sdk/issues/new/choose",
				"#3B818D"
			)}`
		);

	wrangler.group(
		["experimental-json-config", "config", "env", "help", "version"],
		"Global Flags:"
	);
	wrangler.help("help", "⚑Show help").alias("h", "help");

	// Default help command that supports the subcommands
	const subHelp: CommandModule<CommonYargsOptions, CommonYargsOptions> = {
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

	// You will note that we use the form for all commands where we use the builder function
	// to define options and subcommands.
	// Further we return the result of this builder even though it's not completely necessary.
	// The reason is that it's required for type inference of the args in the handle function.
	// I wish we could enforce this pattern, but this comment will have to do for now.
	// (It's also annoying that choices[] doesn't get inferred as an enum. 🤷‍♂.)

	// docs
	wrangler.command(
		"docs [command]",
		"📖 Open wrangler commands doc in your browser",
		docsOptions,
		docsHandler
	);

	// init
	wrangler.command(
		"init [name]",
		"🔸 Initialize a basic worker application",
		initOptions,
		initHandler
	);

	// dev
	wrangler.command(
		"dev [script]",
		"🔸 Start a local server for developing a worker",
		devOptions,
		devHandler
	);

	// deploy
	wrangler.command(
		["deploy [script]", "publish [script]"],
		"🔸 Deploy a Worker to Cloudflare",
		deployOptions,
		deployHandler
	);

	// [OPEN BETA] deployments
	const deploymentsWarning =
		"🚧`wrangler deployments` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose";
	wrangler.command(
		"deployments",
		`🧪 List and view details for deployments for a Worker ${highlight(
			"open beta",
			"#FF8800"
		)}`,
		(yargs) =>
			yargs
				.option("name", {
					describe: "The name of your worker",
					type: "string",
				})
				.command(
					"list",
					"🔸 Displays the 10 most recent deployments for a worker",
					async (listYargs) => listYargs,
					async (listYargs) => {
						const { accountId, scriptName, config } =
							await commonDeploymentCMDSetup(listYargs, deploymentsWarning);
						await deployments(accountId, scriptName, config);
					}
				)
				.command(
					"view [deployment-id]",
					"🔸 View a deployment",
					async (viewYargs) =>
						viewYargs.positional("deployment-id", {
							describe: "The ID of the deployment you want to inspect",
							type: "string",
							demandOption: false,
						}),
					async (viewYargs) => {
						const { accountId, scriptName, config } =
							await commonDeploymentCMDSetup(viewYargs, deploymentsWarning);

						await viewDeployment(
							accountId,
							scriptName,
							config,
							viewYargs.deploymentId
						);
					}
				)
				.command(subHelp)
				.epilogue(deploymentsWarning)
	);

	// [OPEN BETA] rollback
	const rollbackWarning =
		"🚧`wrangler rollback` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose";
	wrangler.command(
		"rollback [deployment-id]",
		`🧪 Rollback a deployment for a Worker ${highlight("open beta", "#FF8800")}`,
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
				.epilogue(rollbackWarning),
		async (rollbackYargs) => {
			const { accountId, scriptName, config } = await commonDeploymentCMDSetup(
				rollbackYargs,
				rollbackWarning
			);

			await rollbackDeployment(
				accountId,
				scriptName,
				config,
				rollbackYargs.deploymentId,
				rollbackYargs.message
			);
		}
	);

	// delete
	wrangler.command(
		"delete [script]",
		"🔸 Delete a Worker from Cloudflare",
		deleteOptions,
		deleteHandler
	);

	// tail
	wrangler.command(
		"tail [worker]",
		"🔸 Start a log tailing session for a Worker",
		tailOptions,
		tailHandler
	);

	// secret
	wrangler.command(
		"secret",
		"🔸 Generate a secret that can be referenced in a Worker",
		(secretYargs) => {
			return secret(secretYargs.command(subHelp));
		}
	);

	// secret bulk
	wrangler.command(
		"secret:bulk [json]",
		"🔸 Bulk upload secrets for a Worker",
		secretBulkOptions,
		secretBulkHandler
	);

	// type generation
	wrangler.command(
		"types [path]",
		"🔸 Generate types from bindings & module rules in config",
		typesOptions,
		typesHandler
	);

	// kv namespace
	wrangler.command(
		"kv:namespace",
		"🔹 Manage Workers KV namespaces",
		(namespaceYargs) => {
			return kvNamespace(namespaceYargs.command(subHelp));
		}
	);

	// kv key
	wrangler.command(
		"kv:key",
		"🔹 Manage individual Workers KV key-value pairs",
		(keyYargs) => {
			return kvKey(keyYargs.command(subHelp));
		}
	);

	// kv bulk
	wrangler.command(
		"kv:bulk",
		"🔹 Manage Workers KV key-value pairs in bulk",
		(bulkYargs) => {
			return kvBulk(bulkYargs.command(subHelp));
		}
	);

	// queues
	wrangler.command("queues", "🔹 Manage Workers Queues", (queuesYargs) => {
		return queues(queuesYargs.command(subHelp));
	});

	// d1
	wrangler.command(
		"d1",
		`🔹 Manage Workers D1 databases`,
		(d1Yargs) => {
			return d1(d1Yargs.command(subHelp));
		}
	);

	// [OPEN BETA] hyperdrive
	wrangler.command(
		"hyperdrive",
		`🧪 Configure Hyperdrive databases ${highlight("open beta", "#FF8800")}`,
		(hyperdriveYargs) => {
			return hyperdrive(hyperdriveYargs.command(subHelp));
		}
	);

	// ai
	wrangler.command("ai", "🔹 Manage AI models", (aiYargs) => {
		return ai(aiYargs.command(subHelp));
	});

	// cloudchamber
	wrangler.command("cloudchamber", false, (cloudchamberArgs) => {
		return cloudchamber(asJson(cloudchamberArgs.command(subHelp)), subHelp);
	});

	// [OPEN BETA] vectorize
	wrangler.command(
		"vectorize",
		`🧪 Manage Vectorize indexes ${highlight("open beta", "#FF8800")}`,
		(vectorYargs) => {
			return vectorize(vectorYargs.command(subHelp));
		}
	);

	// r2
	wrangler.command("r2", "🔹 Manage R2 buckets & objects", (r2Yargs) => {
		return r2(r2Yargs.command(subHelp));
	});

	// mtls-certificate
	wrangler.command(
		"mtls-certificate",
		"🔹 Manage certificates used for mTLS connections",
		(mtlsYargs) => {
			return mTlsCertificateCommands(mtlsYargs.command(subHelp));
		}
	);

	// [PRIVATE BETA] pubsub
	wrangler.command(
		"pubsub",
		`🧪 Manage Pub/Sub brokers ${highlight("private beta", "#FF8800")}`,
		(pubsubYargs) => {
			return pubSubCommands(pubsubYargs, subHelp);
		}
	);

	// pages
	wrangler.command(
		"pages",
		"🔹 Configure Cloudflare Pages applications",
		(pagesYargs) => {
			return pages(pagesYargs.command(subHelp));
		}
	);

	// dispatch-namespace
	wrangler.command(
		"dispatch-namespace",
		"🔹 Manage dispatch namespaces",
		(workerNamespaceYargs) => {
			return workerNamespaceCommands(workerNamespaceYargs, subHelp);
		}
	);

	/**
	 * User Group: login, logout, and whoami
	 * TODO: group commands into User group similar to .group() for flags in yargs
	 */
	// login
	wrangler.command(
		// this needs scopes as an option?
		"login",
		"🔓 Login to Cloudflare",
		(yargs) => {
			// TODO: This needs some copy editing
			// I mean, this entire app does, but this too.
			return yargs
				.option("scopes-list", {
					describe: "List all the available OAuth scopes with descriptions",
				})
				.option("browser", {
					default: true,
					type: "boolean",
					describe: "Automatically open the OAuth link in a browser",
				})
				.option("scopes", {
					describe: "Pick the set of applicable OAuth scopes when logging in",
					array: true,
					type: "string",
					requiresArg: true,
				});

			// TODO: scopes
		},
		async (args) => {
			await printWranglerBanner();
			if (args["scopes-list"]) {
				listScopes();
				return;
			}
			if (args.scopes) {
				if (args.scopes.length === 0) {
					// don't allow no scopes to be passed, that would be weird
					listScopes();
					return;
				}
				if (!validateScopeKeys(args.scopes)) {
					throw new CommandLineArgsError(
						`One of ${args.scopes} is not a valid authentication scope. Run "wrangler login --scopes-list" to see the valid scopes.`
					);
				}
				await login({ scopes: args.scopes, browser: args.browser });
				return;
			}
			await login({ browser: args.browser });
			const config = readConfig(args.config, args);
			await metrics.sendMetricsEvent("login user", {
				sendMetrics: config.send_metrics,
			});

			// TODO: would be nice if it optionally saved login
			// credentials inside node_modules/.cache or something
			// this way you could have multiple users on a single machine
		}
	);

	// logout
	wrangler.command(
		// this needs scopes as an option?
		"logout",
		"🔓 Logout from Cloudflare",
		() => {},
		async (args) => {
			await printWranglerBanner();
			await logout();
			const config = readConfig(undefined, args);
			await metrics.sendMetricsEvent("logout user", {
				sendMetrics: config.send_metrics,
			});
		}
	);

	// whoami
	wrangler.command(
		"whoami",
		"🔓 Retrieve user info and test your auth config",
		() => {},
		async (args) => {
			await printWranglerBanner();
			await whoami();
			const config = readConfig(undefined, args);
			await metrics.sendMetricsEvent("view accounts", {
				sendMetrics: config.send_metrics,
			});
		}
	);

	// [DEPRECATED] generate
	wrangler.command(
		"generate [name] [template]",
		false,
		// "✨ Generate a new Worker project from an existing Worker template. See https://github.com/cloudflare/templates",
		generateOptions,
		generateHandler
	);

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

	// [DEPRECATED] constellation
	wrangler.command("constellation", false, (aiYargs) => {
		return constellation(aiYargs.command(subHelp));
	});

	// This set to false to allow overwrite of default behaviour
	wrangler.version(false);

	// version
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
		}
	);

	// versions
	const experimentalGradualRollouts = argv.includes(
		"--experimental-gradual-rollouts"
	);
	if (experimentalGradualRollouts) {
		wrangler.command("versions", false, (versionYargs) => {
			return versionYargs.command(
				"upload",
				"Upload a Worker for Gradual Rollouts [beta]",
				versionsUploadOptions,
				versionsUploadHandler
			);
		});
	}

	wrangler.exitProcess(false);

	return wrangler;
}

export async function main(argv: string[]): Promise<void> {
	setupSentry();

	const wrangler = createCLIParser(argv);

	// Register Yargs middleware to record command as Sentry breadcrumb
	let recordedCommand = false;
	const wranglerWithMiddleware = wrangler.middleware((args) => {
		// Middleware called for each sub-command, but only want to record once
		if (recordedCommand) return;
		recordedCommand = true;
		// `args._` doesn't include any positional arguments (e.g. script name,
		// key to fetch) or flags
		addBreadcrumb(`wrangler ${args._.join(" ")}`);
	}, /* applyBeforeValidation */ true);

	let cliHandlerThrew = false;
	try {
		await wranglerWithMiddleware.parse();
	} catch (e) {
		cliHandlerThrew = true;
		let mayReport = true;

		logger.log(""); // Just adds a bit of space
		if (e instanceof CommandLineArgsError) {
			logger.error(e.message);
			// We are not able to ask the `wrangler` CLI parser to show help for a subcommand programmatically.
			// The workaround is to re-run the parsing with an additional `--help` flag, which will result in the correct help message being displayed.
			// The `wrangler` object is "frozen"; we cannot reuse that with different args, so we must create a new CLI parser to generate the help message.
			await createCLIParser([...argv, "--help"]).parse();
		} else if (isAuthenticationError(e)) {
			mayReport = false;
			logger.log(formatMessage(e));
			const envAuth = getAuthFromEnv();
			if (envAuth !== undefined && "apiToken" in envAuth) {
				const message =
					"📎 It looks like you are authenticating Wrangler via a custom API token set in an environment variable.\n" +
					"Please ensure it has the correct permissions for this operation.\n";
				logger.log(chalk.yellow(message));
			}
			await whoami();
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
			logBuildFailure(e.errors, e.warnings);
			logger.error(e.message);
		} else {
			logger.error(e instanceof Error ? e.message : e);
			if (!(e instanceof UserError)) {
				logger.log(
					`${fgGreenColor}%s${resetColor}`,
					"If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose"
				);
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

		throw e;
	} finally {
		try {
			// In the bootstrapper script `bin/wrangler.js`, we open an IPC channel,
			// so IPC messages from this process are propagated through the
			// bootstrapper. Normally, Node's SIGINT handler would close this for us,
			// but interactive dev mode enables raw mode on stdin which disables the
			// built-in handler. Make sure this channel is closed once it's no longer
			// needed, so we can cleanly exit. Note, we don't want to disconnect if
			// this file was imported in Jest, as that would stop communication with
			// the test runner.
			if (typeof jest === "undefined") process.disconnect?.();

			await closeSentry();
		} catch (e) {
			logger.error(e);
			// Only re-throw if we haven't already re-thrown an exception from a
			// command handler.
			// eslint-disable-next-line no-unsafe-finally
			if (!cliHandlerThrew) throw e;
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
				"Add one to your wrangler.toml file:\n" +
				"```\n" +
				`compatibility_date = "${currentDate}"\n` +
				"```\n" +
				"or pass it in your terminal:\n" +
				"```\n" +
				`--compatibility-date=${currentDate}\n` +
				"```\n" +
				"See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
		);
	}
	return compatibilityDate ?? currentDate;
}

export { printWranglerBanner };
