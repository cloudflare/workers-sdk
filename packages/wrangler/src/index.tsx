import { StringDecoder } from "node:string_decoder";
import TOML from "@iarna/toml";
import chalk from "chalk";
import supportsColor from "supports-color";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import makeCLI from "yargs";
import { version as wranglerVersion } from "../package.json";
import { readConfig } from "./config";
import { d1 } from "./d1";
import { devHandler, devOptions } from "./dev";
import { confirm } from "./dialogs";
import { workerNamespaceCommands } from "./dispatch-namespace";
import { DeprecationError } from "./errors";
import { generateHandler, generateOptions } from "./generate";
import { initHandler, initOptions } from "./init";
import { kvNamespace } from "./kv";
import {
	deleteKVBulkKeyValue,
	deleteKVKeyValue,
	getKVKeyValue,
	getKVNamespaceId,
	isKVKeyValue,
	listKVNamespaceKeys,
	putKVBulkKeyValue,
	putKVKeyValue,
	unexpectedKVKeyValueProps,
} from "./kv/helpers";
import { logger } from "./logger";
import * as metrics from "./metrics";
import { pages } from "./pages";
import {
	formatMessage,
	ParseError,
	parseJSON,
	readFileSync,
	readFileSyncToBuffer,
} from "./parse";
import { previewHandler, previewOptions } from "./preview";
import { publishOptions, publishHandler } from "./publish";
import { pubSubCommands } from "./pubsub/pubsub-commands";
import { r2 } from "./r2";
import { secret, secretBulkHandler, secretBulkOptions } from "./secret";
import { tailOptions, tailHandler } from "./tail";
import { updateCheck } from "./update-check";
import {
	listScopes,
	login,
	logout,
	requireAuth,
	validateScopeKeys,
} from "./user";
import { whoami } from "./whoami";

import type { Config } from "./config";
import type { KeyValue } from "./kv/helpers";
import type Yargs from "yargs";

export type ConfigPath = string | undefined;

const resetColor = "\x1b[0m";
const fgGreenColor = "\x1b[32m";
export const DEFAULT_LOCAL_PORT = 8787;
export const DEFAULT_INSPECTOR_PORT = 9229;

const proxy =
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
		throw new Error(
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

export async function printWranglerBanner() {
	// Let's not print this in tests
	if (typeof jest !== "undefined") {
		return;
	}

	const text = ` ⛅️ wrangler ${wranglerVersion} ${await updateCheck()}`;

	logger.log(
		text +
			"\n" +
			(supportsColor.stdout
				? chalk.hex("#FF8800")("-".repeat(text.length))
				: "-".repeat(text.length))
	);
}

export function isLegacyEnv(config: Config): boolean {
	// We only read from config here, because we've already accounted for
	// args["legacy-env"] in https://github.com/cloudflare/wrangler2/blob/b24aeb5722370c2e04bce97a84a1fa1e55725d79/packages/wrangler/src/config/validation.ts#L94-L98
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
 * Alternative to the getScriptName() because special Legacy cases allowed "name", and "env" together in Wrangler1
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
	return function (argv: Yargs.Arguments) {
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

export class CommandLineArgsError extends Error {}

function createCLIParser(argv: string[]) {
	const wrangler = makeCLI(argv)
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
		.wrap(null);

	// Default help command that supports the subcommands
	const subHelp: Yargs.CommandModule = {
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

	// [DEPRECATED] generate
	wrangler.command(
		// we definitely want to move away from us cloning github templates
		// we can do something better here, let's see
		"generate [name] [template]",
		false,
		generateOptions,
		generateHandler
	);

	// init
	wrangler.command(
		"init [name]",
		"📥 Create a wrangler.toml configuration file",
		initOptions,
		initHandler
	);

	// build
	wrangler.command(
		"build",
		false,
		(yargs) => {
			return yargs.option("env", {
				describe: "Perform on a specific environment",
				type: "string",
			});
		},
		async (buildArgs) => {
			// "[DEPRECATED] 🦀 Build your project (if applicable)",

			const envFlag = buildArgs.env ? ` --env=${buildArgs.env}` : "";
			logger.log(
				formatMessage({
					kind: "warning",
					text: "Deprecation: `wrangler build` has been deprecated.",
					notes: [
						{
							text: "Please refer to https://developers.cloudflare.com/workers/wrangler/migration/deprecations/#build for more information.",
						},
						{
							text: `Attempting to run \`wrangler publish --dry-run --outdir=dist${envFlag}\` for you instead:`,
						},
					],
				})
			);

			await createCLIParser([
				"publish",
				"--dry-run",
				"--outdir=dist",
				...(buildArgs.env ? ["--env", buildArgs.env] : []),
			]).parse();
		}
	);

	// config
	wrangler.command(
		"config",
		false,
		() => {},
		() => {
			// "🕵️  Authenticate Wrangler with a Cloudflare API Token",
			throw new DeprecationError(
				"`wrangler config` has been deprecated, please refer to https://developers.cloudflare.com/workers/wrangler/migration/deprecations/#config for alternatives"
			);
		}
	);

	// dev
	wrangler.command(
		"dev [script]",
		"👂 Start a local server for developing your worker",
		devOptions,
		devHandler
	);

	// publish
	wrangler.command(
		"publish [script]",
		"🆙 Publish your Worker to Cloudflare.",
		publishOptions,
		publishHandler
	);

	// tail
	wrangler.command(
		"tail [worker]",
		"🦚 Starts a log tailing session for a published Worker.",
		tailOptions,
		tailHandler
	);

	// preview
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
			return routeYargs
				.command(
					"list",
					"List the routes associated with a zone",
					(yargs) => {
						return yargs
							.option("env", {
								type: "string",
								requiresArg: true,
								describe: "Perform on a specific environment",
							})
							.option("zone", {
								type: "string",
								requiresArg: true,
								describe: "Zone id",
							})
							.positional("zone", {
								describe: "Zone id",
								type: "string",
							});
					},
					() => {
						// "👯 [DEPRECATED]. Use wrangler.toml to manage routes.
						const deprecationNotice =
							"`wrangler route list` has been deprecated.";
						const futureRoutes =
							"Refer to wrangler.toml for a list of routes the worker will be deployed to upon publishing.";
						const presentRoutes =
							"Refer to the Cloudflare Dashboard to see the routes this worker is currently running on.";
						throw new DeprecationError(
							`${deprecationNotice}\n${futureRoutes}\n${presentRoutes}`
						);
					}
				)
				.command(
					"delete [id]",
					"Delete a route associated with a zone",
					(yargs) => {
						return yargs
							.positional("id", {
								describe: "The hash of the route ID to delete.",
								type: "string",
							})
							.option("zone", {
								type: "string",
								requiresArg: true,
								describe: "zone id",
							})
							.option("env", {
								type: "string",
								requiresArg: true,
								describe: "Perform on a specific environment",
							});
					},
					() => {
						// "👯 [DEPRECATED]. Use wrangler.toml to manage routes.
						const deprecationNotice =
							"`wrangler route delete` has been deprecated.";
						const shouldDo =
							"Remove the unwanted route(s) from wrangler.toml and run `wrangler publish` to remove your worker from those routes.";
						throw new DeprecationError(`${deprecationNotice}\n${shouldDo}`);
					}
				);
		},
		() => {
			// "👯 [DEPRECATED]. Use wrangler.toml to manage routes.
			const deprecationNotice = "`wrangler route` has been deprecated.";
			const shouldDo =
				"Please use wrangler.toml and/or `wrangler publish --routes` to modify routes";
			throw new DeprecationError(`${deprecationNotice}\n${shouldDo}`);
		}
	);

	// subdomain
	wrangler.command(
		"subdomain [name]",
		false,
		// "👷 Create or change your workers.dev subdomain.",
		(yargs) => {
			return yargs.positional("name", { type: "string" });
		},
		() => {
			throw new DeprecationError(
				"`wrangler subdomain` has been deprecated, please refer to https://developers.cloudflare.com/workers/wrangler/migration/deprecations/#subdomain for alternatives"
			);
		}
	);

	// secret
	wrangler.command(
		"secret",
		"🤫 Generate a secret that can be referenced in a Worker",
		(secretYargs) => {
			return secret(secretYargs.command(subHelp));
		}
	);

	wrangler.command(
		"secret:bulk <json>",
		"🗄️  Bulk upload secrets for a Worker",
		secretBulkOptions,
		secretBulkHandler
	);

	// kv
	// :namespace
	wrangler.command(
		"kv:namespace",
		"🗂️  Interact with your Workers KV Namespaces",
		(namespaceYargs) => {
			return kvNamespace(namespaceYargs.command(subHelp));
		}
	);

	// :key
	wrangler.command(
		"kv:key",
		"🔑 Individually manage Workers KV key-value pairs",
		(kvKeyYargs) => {
			return kvKeyYargs
				.command(subHelp)
				.command(
					"put <key> [value]",
					"Writes a single key/value pair to the given namespace.",
					(yargs) => {
						return yargs
							.positional("key", {
								type: "string",
								describe: "The key to write to",
								demandOption: true,
							})
							.positional("value", {
								type: "string",
								describe: "The value to write",
							})
							.option("binding", {
								type: "string",
								requiresArg: true,
								describe: "The binding of the namespace to write to",
							})
							.option("namespace-id", {
								type: "string",
								requiresArg: true,
								describe: "The id of the namespace to write to",
							})
							.check(demandOneOfOption("binding", "namespace-id"))
							.option("env", {
								type: "string",
								requiresArg: true,
								describe: "Perform on a specific environment",
								alias: "e",
							})
							.option("preview", {
								type: "boolean",
								describe: "Interact with a preview namespace",
							})
							.option("ttl", {
								type: "number",
								describe: "Time for which the entries should be visible",
							})
							.option("expiration", {
								type: "number",
								describe:
									"Time since the UNIX epoch after which the entry expires",
							})
							.option("metadata", {
								type: "string",
								describe: "Arbitrary JSON that is associated with a key",
								coerce: (jsonStr: string): KeyValue["metadata"] => {
									try {
										return JSON.parse(jsonStr);
									} catch (_) {}
								},
							})
							.option("path", {
								type: "string",
								requiresArg: true,
								describe: "Read value from the file at a given path",
							})
							.check(demandOneOfOption("value", "path"));
					},
					async ({ key, ttl, expiration, metadata, ...args }) => {
						await printWranglerBanner();
						const config = readConfig(args.config as ConfigPath, args);
						const namespaceId = getKVNamespaceId(args, config);
						// One of `args.path` and `args.value` must be defined
						const value = args.path
							? readFileSyncToBuffer(args.path)
							: // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							  args.value!;

						const metadataLog = metadata
							? ` with metadata "${JSON.stringify(metadata)}"`
							: "";

						if (args.path) {
							logger.log(
								`Writing the contents of ${args.path} to the key "${key}" on namespace ${namespaceId}${metadataLog}.`
							);
						} else {
							logger.log(
								`Writing the value "${value}" to key "${key}" on namespace ${namespaceId}${metadataLog}.`
							);
						}

						const accountId = await requireAuth(config);

						await putKVKeyValue(accountId, namespaceId, {
							key,
							value,
							expiration,
							expiration_ttl: ttl,
							metadata: metadata as KeyValue["metadata"],
						});
						await metrics.sendMetricsEvent("write kv key-value", {
							sendMetrics: config.send_metrics,
						});
					}
				)
				.command(
					"list",
					"Outputs a list of all keys in a given namespace.",
					(yargs) => {
						return yargs
							.option("binding", {
								type: "string",
								requiresArg: true,
								describe: "The name of the namespace to list",
							})
							.option("namespace-id", {
								type: "string",
								requiresArg: true,
								describe: "The id of the namespace to list",
							})
							.check(demandOneOfOption("binding", "namespace-id"))
							.option("env", {
								type: "string",
								requiresArg: true,
								describe: "Perform on a specific environment",
								alias: "e",
							})
							.option("preview", {
								type: "boolean",
								// In the case of listing keys we will default to non-preview mode
								default: false,
								describe: "Interact with a preview namespace",
							})
							.option("prefix", {
								type: "string",
								requiresArg: true,
								describe: "A prefix to filter listed keys",
							});
					},
					async ({ prefix, ...args }) => {
						// TODO: support for limit+cursor (pagination)
						const config = readConfig(args.config as ConfigPath, args);
						const namespaceId = getKVNamespaceId(args, config);

						const accountId = await requireAuth(config);

						const results = await listKVNamespaceKeys(
							accountId,
							namespaceId,
							prefix
						);
						logger.log(JSON.stringify(results, undefined, 2));
						await metrics.sendMetricsEvent("list kv keys", {
							sendMetrics: config.send_metrics,
						});
					}
				)
				.command(
					"get <key>",
					"Reads a single value by key from the given namespace.",
					(yargs) => {
						return yargs
							.positional("key", {
								describe: "The key value to get.",
								type: "string",
								demandOption: true,
							})
							.option("binding", {
								type: "string",
								requiresArg: true,
								describe: "The name of the namespace to get from",
							})
							.option("namespace-id", {
								type: "string",
								requiresArg: true,
								describe: "The id of the namespace to get from",
							})
							.check(demandOneOfOption("binding", "namespace-id"))
							.option("env", {
								type: "string",
								requiresArg: true,
								describe: "Perform on a specific environment",
								alias: "e",
							})
							.option("preview", {
								type: "boolean",
								describe: "Interact with a preview namespace",
							})
							.option("preview", {
								type: "boolean",
								// In the case of getting key values we will default to non-preview mode
								default: false,
								describe: "Interact with a preview namespace",
							})
							.option("text", {
								type: "boolean",
								default: false,
								describe: "Decode the returned value as a utf8 string",
							});
					},
					async ({ key, ...args }) => {
						const config = readConfig(args.config as ConfigPath, args);
						const namespaceId = getKVNamespaceId(args, config);

						const accountId = await requireAuth(config);
						const bufferKVValue = Buffer.from(
							await getKVKeyValue(accountId, namespaceId, key)
						);

						if (args.text) {
							const decoder = new StringDecoder("utf8");
							logger.log(decoder.write(bufferKVValue));
						} else {
							process.stdout.write(bufferKVValue);
						}
						await metrics.sendMetricsEvent("read kv value", {
							sendMetrics: config.send_metrics,
						});
					}
				)
				.command(
					"delete <key>",
					"Removes a single key value pair from the given namespace.",
					(yargs) => {
						return yargs
							.positional("key", {
								describe: "The key value to delete",
								type: "string",
								demandOption: true,
							})
							.option("binding", {
								type: "string",
								requiresArg: true,
								describe: "The name of the namespace to delete from",
							})
							.option("namespace-id", {
								type: "string",
								requiresArg: true,
								describe: "The id of the namespace to delete from",
							})
							.check(demandOneOfOption("binding", "namespace-id"))
							.option("env", {
								type: "string",
								requiresArg: true,
								describe: "Perform on a specific environment",
								alias: "e",
							})
							.option("preview", {
								type: "boolean",
								describe: "Interact with a preview namespace",
							});
					},
					async ({ key, ...args }) => {
						await printWranglerBanner();
						const config = readConfig(args.config as ConfigPath, args);
						const namespaceId = getKVNamespaceId(args, config);

						logger.log(
							`Deleting the key "${key}" on namespace ${namespaceId}.`
						);

						const accountId = await requireAuth(config);

						await deleteKVKeyValue(accountId, namespaceId, key);
						await metrics.sendMetricsEvent("delete kv key-value", {
							sendMetrics: config.send_metrics,
						});
					}
				);
		}
	);

	// :bulk
	wrangler.command(
		"kv:bulk",
		"💪 Interact with multiple Workers KV key-value pairs at once",
		(kvBulkYargs) => {
			return kvBulkYargs
				.command(subHelp)
				.command(
					"put <filename>",
					"Upload multiple key-value pairs to a namespace",
					(yargs) => {
						return yargs
							.positional("filename", {
								describe: `The JSON file of key-value pairs to upload, in form [{"key":..., "value":...}"...]`,
								type: "string",
								demandOption: true,
							})
							.option("binding", {
								type: "string",
								requiresArg: true,
								describe: "The name of the namespace to insert values into",
							})
							.option("namespace-id", {
								type: "string",
								requiresArg: true,
								describe: "The id of the namespace to insert values into",
							})
							.check(demandOneOfOption("binding", "namespace-id"))
							.option("env", {
								type: "string",
								requiresArg: true,
								describe: "Perform on a specific environment",
								alias: "e",
							})
							.option("preview", {
								type: "boolean",
								describe: "Interact with a preview namespace",
							});
					},
					async ({ filename, ...args }) => {
						await printWranglerBanner();
						// The simplest implementation I could think of.
						// This could be made more efficient with a streaming parser/uploader
						// but we'll do that in the future if needed.

						const config = readConfig(args.config as ConfigPath, args);
						const namespaceId = getKVNamespaceId(args, config);
						const content = parseJSON(readFileSync(filename), filename);

						if (!Array.isArray(content)) {
							throw new Error(
								`Unexpected JSON input from "${filename}".\n` +
									`Expected an array of key-value objects but got type "${typeof content}".`
							);
						}

						const errors: string[] = [];
						const warnings: string[] = [];
						for (let i = 0; i < content.length; i++) {
							const keyValue = content[i];
							if (!isKVKeyValue(keyValue)) {
								errors.push(
									`The item at index ${i} is ${JSON.stringify(keyValue)}`
								);
							} else {
								const props = unexpectedKVKeyValueProps(keyValue);
								if (props.length > 0) {
									warnings.push(
										`The item at index ${i} contains unexpected properties: ${JSON.stringify(
											props
										)}.`
									);
								}
							}
						}
						if (warnings.length > 0) {
							logger.warn(
								`Unexpected key-value properties in "${filename}".\n` +
									warnings.join("\n")
							);
						}
						if (errors.length > 0) {
							throw new Error(
								`Unexpected JSON input from "${filename}".\n` +
									`Each item in the array should be an object that matches:\n\n` +
									`interface KeyValue {\n` +
									`  key: string;\n` +
									`  value: string;\n` +
									`  expiration?: number;\n` +
									`  expiration_ttl?: number;\n` +
									`  metadata?: object;\n` +
									`  base64?: boolean;\n` +
									`}\n\n` +
									errors.join("\n")
							);
						}

						const accountId = await requireAuth(config);
						await putKVBulkKeyValue(accountId, namespaceId, content);
						await metrics.sendMetricsEvent("write kv key-values (bulk)", {
							sendMetrics: config.send_metrics,
						});

						logger.log("Success!");
					}
				)
				.command(
					"delete <filename>",
					"Delete multiple key-value pairs from a namespace",
					(yargs) => {
						return yargs
							.positional("filename", {
								describe: `The JSON file of keys to delete, in the form ["key1", "key2", ...]`,
								type: "string",
								demandOption: true,
							})
							.option("binding", {
								type: "string",
								requiresArg: true,
								describe: "The name of the namespace to delete from",
							})
							.option("namespace-id", {
								type: "string",
								requiresArg: true,
								describe: "The id of the namespace to delete from",
							})
							.check(demandOneOfOption("binding", "namespace-id"))
							.option("env", {
								type: "string",
								requiresArg: true,
								describe: "Perform on a specific environment",
								alias: "e",
							})
							.option("preview", {
								type: "boolean",
								describe: "Interact with a preview namespace",
							})
							.option("force", {
								type: "boolean",
								alias: "f",
								describe: "Do not ask for confirmation before deleting",
							});
					},
					async ({ filename, ...args }) => {
						await printWranglerBanner();
						const config = readConfig(args.config as ConfigPath, args);
						const namespaceId = getKVNamespaceId(args, config);

						if (!args.force) {
							const result = await confirm(
								`Are you sure you want to delete all the keys read from "${filename}" from kv-namespace with id "${namespaceId}"?`
							);
							if (!result) {
								logger.log(`Not deleting keys read from "${filename}".`);
								return;
							}
						}

						const content = parseJSON(
							readFileSync(filename),
							filename
						) as string[];

						if (!Array.isArray(content)) {
							throw new Error(
								`Unexpected JSON input from "${filename}".\n` +
									`Expected an array of strings but got:\n${content}`
							);
						}

						const errors: string[] = [];
						for (let i = 0; i < content.length; i++) {
							const key = content[i];
							if (typeof key !== "string") {
								errors.push(
									`The item at index ${i} is type: "${typeof key}" - ${JSON.stringify(
										key
									)}`
								);
							}
						}

						if (errors.length > 0) {
							throw new Error(
								`Unexpected JSON input from "${filename}".\n` +
									`Expected an array of strings.\n` +
									errors.join("\n")
							);
						}

						const accountId = await requireAuth(config);

						await deleteKVBulkKeyValue(accountId, namespaceId, content);
						await metrics.sendMetricsEvent("delete kv key-values (bulk)", {
							sendMetrics: config.send_metrics,
						});

						logger.log("Success!");
					}
				);
		}
	);

	// pages
	wrangler.command("pages", "⚡️ Configure Cloudflare Pages", (pagesYargs) => {
		return pages(pagesYargs.command(subHelp));
	});

	// r2
	wrangler.command("r2", "📦 Interact with an R2 store", (r2Yargs) => {
		return r2(r2Yargs.command(subHelp));
	});

	// dispatch-namespace
	wrangler.command(
		"dispatch-namespace",
		"📦 Interact with a dispatch namespace",
		(workerNamespaceYargs) => {
			return workerNamespaceCommands(workerNamespaceYargs, subHelp);
		}
	);

	// d1
	wrangler.command("d1", "🗄  Interact with a D1 database", (d1Yargs) => {
		return d1(d1Yargs.command(subHelp));
	});

	// pubsub
	wrangler.command(
		"pubsub",
		"📮 Interact and manage Pub/Sub Brokers",
		(pubsubYargs) => {
			return pubSubCommands(pubsubYargs, subHelp);
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
						`One of ${args.scopes} is not a valid authentication scope. Run "wrangler login --list-scopes" to see the valid scopes.`
					);
				}
				await login({ scopes: args.scopes });
				return;
			}
			await login();
			const config = readConfig(args.config as ConfigPath, args);
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
		"🚪 Logout from Cloudflare",
		() => {},
		async () => {
			await printWranglerBanner();
			await logout();
			const config = readConfig(undefined, {});
			await metrics.sendMetricsEvent("logout user", {
				sendMetrics: config.send_metrics,
			});
		}
	);

	// whoami
	wrangler.command(
		"whoami",
		"🕵️  Retrieve your user info and test your auth config",
		() => {},
		async () => {
			await printWranglerBanner();
			await whoami();
			const config = readConfig(undefined, {});
			await metrics.sendMetricsEvent("view accounts", {
				sendMetrics: config.send_metrics,
			});
		}
	);

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

	wrangler.option("v", {
		describe: "Show version number",
		alias: "version",
		type: "boolean",
	});

	wrangler.option("config", {
		alias: "c",
		describe: "Path to .toml configuration file",
		type: "string",
		requiresArg: true,
	});

	wrangler.group(["config", "help", "version"], "Flags:");
	wrangler.help().alias("h", "help");

	wrangler.exitProcess(false);

	return wrangler;
}

export async function main(argv: string[]): Promise<void> {
	const wrangler = createCLIParser(argv);
	try {
		await wrangler.parse();
	} catch (e) {
		logger.log(""); // Just adds a bit of space
		if (e instanceof CommandLineArgsError) {
			logger.error(e.message);
			// We are not able to ask the `wrangler` CLI parser to show help for a subcommand programmatically.
			// The workaround is to re-run the parsing with an additional `--help` flag, which will result in the correct help message being displayed.
			// The `wrangler` object is "frozen"; we cannot reuse that with different args, so we must create a new CLI parser to generate the help message.
			await createCLIParser([...argv, "--help"]).parse();
		} else if (e instanceof ParseError) {
			e.notes.push({
				text: "\nIf you think this is a bug, please open an issue at: https://github.com/cloudflare/wrangler2/issues/new/choose",
			});
			logger.log(formatMessage(e));
		} else {
			logger.error(e instanceof Error ? e.message : e);
			logger.log(
				`${fgGreenColor}%s${resetColor}`,
				"If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new/choose"
			);
		}
		throw e;
	}
}

export function getDevCompatibilityDate(
	config: Config,
	compatibilityDate = config.compatibility_date
) {
	const currentDate = new Date().toISOString().substring(0, 10);
	if (config.configPath !== undefined && compatibilityDate === undefined) {
		logger.warn(
			`No compatibility_date was specified. Using today's date: ${currentDate}.\n` +
				"Add one to your wrangler.toml file:\n" +
				"```\n" +
				`compatibility_date = "${currentDate}"\n` +
				"```\n" +
				"or pass it in your terminal:\n" +
				"```\n" +
				`--compatibility-date=${currentDate}\n` +
				"```\n" +
				"See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information."
		);
	}
	return compatibilityDate ?? currentDate;
}
