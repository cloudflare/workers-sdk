import chalk from "chalk";
import { readConfig } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import { requireAuth } from "../user";
import {
	claimConnection,
	createConnection,
	createConnectionNamespace,
	getConnectionNamespace,
	listConsumerConnections,
	listProviderNamespaces,
	updateHooks,
	verifyToken,
} from "./client";
import { validateHooks, validateMetadata, validateResources } from "./utils";
import type { CommonYargsArgv } from "../yargs-types";

export function connections(connectionYargs: CommonYargsArgv) {
	return connectionYargs
		.command(
			"namespaces",
			"Manage your Connection Namespaces (as a provider)",
			(yargs) => {
				return yargs
					.command(
						"list",
						"List all your connections namespaces (as a provider)",
						() => {},
						async (args) => {
							const config = readConfig(args);
							const accountId = await requireAuth(config);

							const list = await listProviderNamespaces(accountId);
							logger.table(list.map(stringifyValues));
						}
					)
					.command(
						"create <namespace_name>",
						"Create a new connections namespace (as a provider)",
						(createYargs) =>
							createYargs.positional("namespace_name", {
								describe: "Your connection namespace name",
								type: "string",
								demandOption: true,
							}),
						async (args) => {
							const config = readConfig(args);
							const accountId = await requireAuth(config);

							await createConnectionNamespace(accountId, args.namespace_name);
							logger.log(
								`✅ Successfully created connection namespace "${args.namespace_name}"!`
							);
						}
					);
			}
		)
		.command(
			"create <connection_name>",
			"Create a new connection (as a provider)",
			(yargs) => {
				return yargs
					.positional("connection_name", {
						describe: "The name of the new connection",
						type: "string",
						demandOption: true,
					})
					.option("namespace", {
						type: "string",
						describe: "Namespace to attach to",
						demandOption: true,
					})
					.option("metadata", {
						type: "string",
						describe:
							"Metadata about this connection. E.g. title, description (JSON encoded)",
					})
					.option("domain", {
						type: "string",
						describe: "A public domain you own that identifies you",
					})
					.option("resource", {
						type: "array",
						describe: [
							"Resource to expose to the user. You can provide multiple resources, but each must be of the correct format:",
							chalk.yellow(
								"<resource_name>:<target_script>:<entrypoint>:<args>"
							),
							"  • resource_name: required [string]",
							"  • target_script: optional (defaults to the current worker) [string]",
							"  • entrypoint: optional (defaults to 'default') [string]",
							"  • args: optional (defaults to '{}') [json-encoded string]",
						].join("\n"),
					});
			},
			async (args) => {
				const config = readConfig(args);
				const accountId = await requireAuth(config);

				const { token } = await createConnection(
					accountId,
					args.namespace,
					args.connection_name,
					validateMetadata(args.metadata),
					args.domain,
					validateResources(args.resource, config)
				);
				logger.log(
					`✅ Successfully created connection "${args.connection_name}" in namespace "${args.namespace}"!`
				);
				logger.log(`🔑 Connection token: ${token}`);
			}
		)
		.command(
			"verify <token>",
			"Verify that a given connection token is valid",
			(yargs) => {
				return yargs.positional("token", {
					describe: "The token given to you by the provider",
					type: "string",
					demandOption: true,
				});
			},
			async (args) => {
				const config = readConfig(args);
				const accountId = await requireAuth(config);

				const { metadata } = await verifyToken(accountId, args.token);
				logger.table(
					Object.entries(metadata).map(([k, v]) => ({
						metadata: k,
						value: JSON.stringify(v, null, 2),
					}))
				);
			}
		)
		.command(
			"claim <token> <alias>",
			"Claim an open connection (as a consumer)",
			(yargs) => {
				return yargs
					.positional("token", {
						describe: "The token given to you by the provider",
						type: "string",
						demandOption: true,
					})
					.positional("alias", {
						type: "string",
						describe:
							"Your local alias for your side of the connection (as a consumer)",
						demandOption: true,
					});
			},
			async (args) => {
				const config = readConfig(args);
				const accountId = await requireAuth(config);

				const { alias, token } = args;
				await claimConnection(accountId, token, alias);

				const toml = [
					`[[services]]`,
					`binding = "${alias.replace(/\W/g, "_").toUpperCase()}"`,
					`service = "connection:${alias}"`,
					`entrypoint = "<resource_name>"`,
				].join("\n");

				logger.log(
					`✅ Successfully claimed connection "${alias}"! Add the following to your wrangler.toml to use it:\n\n${toml}`
				);
			}
		)
		.command(
			"list",
			"List your connections (as provider or consumer)",
			(yargs) => {
				return yargs
					.option("namespace", {
						type: "string",
						describe:
							"List connections you're providing in specified namespace",
					})
					.option("consumer", {
						type: "boolean",
						describe: "List connections you're consuming",
					});
			},
			async (args) => {
				if (!args.namespace && !args.consumer) {
					throw new UserError(`Must specify either --namespace or --consumer`);
				}
				const config = readConfig(args);
				const accountId = await requireAuth(config);

				if (args.namespace) {
					const namespace = await getConnectionNamespace(
						accountId,
						args.namespace
					);
					logger.table(namespace.connections.map(stringifyValues));
				} else {
					const list = await listConsumerConnections(accountId);
					logger.table(list.map(stringifyValues));
				}
			}
		)
		.command("hooks", "Manage connection hooks (inbound events)", (yargs) => {
			return yargs.command(
				"update <alias>",
				"Update connection hooks (replaces any existing)",
				(updateYargs) => {
					return updateYargs
						.positional("alias", {
							type: "string",
							describe: "The connection alias to update",
							demandOption: true,
						})
						.option("hook", {
							type: "array",
							describe:
								"[Array] which hooks to register to the user. Each instance of this option should be a JSON-encoded tuple of {name, target_script, entrypoint, args}",
						})
						.option("hook", {
							type: "array",
							describe: [
								"Which hooks to expose to the user. You can provide multiple hooks, but each must be of the correct format:",
								chalk.yellow("<hook_name>:<target_script>:<entrypoint>:<args>"),
								"  • hook_name: required [string]",
								"  • target_script: optional (defaults to the current worker) [string]",
								"  • entrypoint: optional (defaults to 'default') [string]",
								"  • args: optional (defaults to '{}') [json-encoded string]",
							].join("\n"),
						});
				},
				async (args) => {
					const config = readConfig(args);
					const accountId = await requireAuth(config);

					await updateHooks(
						accountId,
						args.alias,
						validateHooks(args.hook, config)
					);
					logger.log(`✅ Successfully updated hooks for "${args.alias}"!`);
				}
			);
		});
}

const stringifyValues = (obj: Record<string, unknown>) =>
	Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));
