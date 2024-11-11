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
	verifyToken,
} from "./client";
import { validateMetadata, validateResources } from "./utils";
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
						(yargs) => {},
						async (args) => {
							const config = readConfig(args.config, args);
							const accountId = await requireAuth(config);

							const list = await listProviderNamespaces(accountId);
							logger.table(list.map(stringifyValues));
						}
					)
					.command(
						"create <namespace_name>",
						"Create a new connections namespace (as a provider)",
						(yargs) =>
							yargs.positional("namespace_name", {
								describe: "Your connection namespace name",
								type: "string",
								demandOption: true,
							}),
						async (args) => {
							const config = readConfig(args.config, args);
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
						describe:
							"[Array] which resources to expose to the user. Each instance of this option should be a JSON-encoded tuple of {name, target_script, entrypoint, args}",
					});
			},
			async (args) => {
				const config = readConfig(args.config, args);
				const accountId = await requireAuth(config);

				const { token } = await createConnection(
					accountId,
					args.namespace,
					args.connection_name,
					validateMetadata(args.metadata),
					args.domain,
					validateResources(args.resource)
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
				const config = readConfig(args.config, args);
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
				const config = readConfig(args.config, args);
				const accountId = await requireAuth(config);

				const { alias, token } = args;
				await claimConnection(accountId, token, alias);

				const toml = [
					`[[services]]`,
					`binding = "${alias.replace(/\W/g, "_").toUpperCase()}"`,
					`service = "connection:${alias}"`,
					`entrypoint = "RESOURCE_IN_<resource_name>"`,
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
				const config = readConfig(args.config, args);
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
		);
	// .command(
	// 	"list",
	// 	"List current connections",
	// 	(yargs) => yargs,
	// 	async (args) => {
	// 		const config = readConfig(args.config, args);
	// 		const accountId = await requireAuth(config);
	//
	// 		// TODO: we should show bindings & transforms if they exist for given ids
	// 		const list = await listconnections(accountId);
	// 		await metrics.sendMetricsEvent("list connections", {
	// 			sendMetrics: config.send_metrics,
	// 		});
	//
	// 		logger.table(
	// 			list.map((connection) => ({
	// 				name: connection.name,
	// 				id: connection.id,
	// 				endpoint: connection.endpoint,
	// 			}))
	// 		);
	// 	}
	// )
	// .command(
	// 	"show <connection>",
	// 	"Show a connection configuration",
	// 	(yargs) => {
	// 		return yargs.positional("connection", {
	// 			type: "string",
	// 			describe: "The name of the connection to show",
	// 			demandOption: true,
	// 		});
	// 	},
	// 	async (args) => {
	// 		await printWranglerBanner();
	// 		const config = readConfig(args.config, args);
	// 		const accountId = await requireAuth(config);
	// 		const name = args.connection;
	//
	// 		validateName("connection name", name);
	//
	// 		logger.log(`Retrieving config for connection "${name}".`);
	// 		const connection = await getconnection(accountId, name);
	// 		await metrics.sendMetricsEvent("show connection", {
	// 			sendMetrics: config.send_metrics,
	// 		});
	//
	// 		logger.log(JSON.stringify(connection, null, 2));
	// 	}
	// )
	// .command(
	// 	"update <connection>",
	// 	"Update a connection",
	// 	(yargs) => {
	// 		return addCreateAndUpdateOptions(yargs)
	// 			.positional("connection", {
	// 				describe: "The name of the connection to update",
	// 				type: "string",
	// 				demandOption: true,
	// 			})
	// 			.option("r2", {
	// 				type: "string",
	// 				describe: "Destination R2 bucket name",
	// 				demandOption: false,
	// 			});
	// 	},
	// 	async (args) => {
	// 		await printWranglerBanner();
	//
	// 		const name = args.connection;
	// 		// only the fields set will be updated - other fields will use the existing config
	// 		const config = readConfig(args.config, args);
	// 		const accountId = await requireAuth(config);
	//
	// 		const connectionConfig = await getconnection(accountId, name);
	//
	// 		if (args.compression) {
	// 			connectionConfig.destination.compression.type = args.compression;
	// 		}
	// 		if (args["batch-max-mb"]) {
	// 			connectionConfig.destination.batch.max_mb = args["batch-max-mb"];
	// 		}
	// 		if (args["batch-max-seconds"]) {
	// 			connectionConfig.destination.batch.max_duration_s =
	// 				args["batch-max-seconds"];
	// 		}
	// 		if (args["batch-max-rows"]) {
	// 			connectionConfig.destination.batch.max_rows = args["batch-max-rows"];
	// 		}
	//
	// 		const bucket = args.r2;
	// 		const accessKeyId = args["access-key-id"];
	// 		const secretAccessKey = args["secret-access-key"];
	// 		if (bucket || accessKeyId || secretAccessKey) {
	// 			const destination = connectionConfig.destination;
	// 			if (bucket) {
	// 				connectionConfig.destination.path.bucket = bucket;
	// 			}
	// 			destination.credentials = {
	// 				endpoint: getAccountR2Endpoint(accountId),
	// 				access_key_id: accessKeyId || "",
	// 				secret_access_key: secretAccessKey || "",
	// 			};
	// 			if (!accessKeyId && !secretAccessKey) {
	// 				const auth = await authorizeR2Bucket(
	// 					name,
	// 					accountId,
	// 					destination.path.bucket
	// 				);
	// 				destination.credentials.access_key_id = auth.access_key_id;
	// 				destination.credentials.secret_access_key = auth.secret_access_key;
	// 			}
	// 			if (!destination.credentials.access_key_id) {
	// 				throw new FatalError("Requires a r2 access key id");
	// 			}
	//
	// 			if (!destination.credentials.secret_access_key) {
	// 				throw new FatalError("Requires a r2 secret access key");
	// 			}
	// 		}
	//
	// 		if (args.binding !== undefined) {
	// 			// strip off old source & keep if necessary
	// 			const source = connectionConfig.source.find(
	// 				(s: Source) => s.type == "binding"
	// 			);
	// 			connectionConfig.source = connectionConfig.source.filter(
	// 				(s: Source) => s.type != "binding"
	// 			);
	// 			if (args.binding) {
	// 				// add back only if specified
	// 				connectionConfig.source.push({
	// 					type: "binding",
	// 					format: "json",
	// 					...source,
	// 				});
	// 			}
	// 		}
	//
	// 		if (args.http !== undefined) {
	// 			// strip off old source & keep if necessary
	// 			const source = connectionConfig.source.find(
	// 				(s: Source) => s.type == "http"
	// 			);
	// 			connectionConfig.source = connectionConfig.source.filter(
	// 				(s: Source) => s.type != "http"
	// 			);
	// 			if (args.http) {
	// 				// add back if specified
	// 				connectionConfig.source.push({
	// 					type: "http",
	// 					format: "json",
	// 					...source,
	// 					authentication:
	// 						args.authentication !== undefined
	// 							? // if auth specified, use it
	// 								args.authentication
	// 							: // if auth not specified, use previos value or default(false)
	// 								source?.authentication,
	// 				} satisfies HttpSource);
	// 			}
	// 		}
	//
	// 		if (args.transform !== undefined) {
	// 			connectionConfig.transforms.push(parseTransform(args.transform));
	// 		}
	//
	// 		if (args.filepath) {
	// 			connectionConfig.destination.path.filepath = args.filepath;
	// 		}
	// 		if (args.filename) {
	// 			connectionConfig.destination.path.filename = args.filename;
	// 		}
	//
	// 		logger.log(`🌀 Updating connection "${name}"`);
	// 		const connection = await updateconnection(
	// 			accountId,
	// 			name,
	// 			connectionConfig
	// 		);
	// 		await metrics.sendMetricsEvent("update connection", {
	// 			sendMetrics: config.send_metrics,
	// 		});
	//
	// 		logger.log(
	// 			`✅ Successfully updated connection "${connection.name}" with ID ${connection.id}\n`
	// 		);
	// 	}
	// )
	// .command(
	// 	"delete <connection>",
	// 	"Delete a connection",
	// 	(yargs) => {
	// 		return yargs.positional("connection", {
	// 			type: "string",
	// 			describe: "The name of the connection to delete",
	// 			demandOption: true,
	// 		});
	// 	},
	// 	async (args) => {
	// 		await printWranglerBanner();
	// 		const config = readConfig(args.config, args);
	// 		const accountId = await requireAuth(config);
	// 		const name = args.connection;
	//
	// 		validateName("connection name", name);
	//
	// 		logger.log(`Deleting connection ${name}.`);
	// 		await deleteconnection(accountId, name);
	// 		logger.log(`Deleted connection ${name}.`);
	// 		await metrics.sendMetricsEvent("delete connection", {
	// 			sendMetrics: config.send_metrics,
	// 		});
	// 	}
	// );
}

const stringifyValues = (obj: Record<string, unknown>) =>
	Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));
