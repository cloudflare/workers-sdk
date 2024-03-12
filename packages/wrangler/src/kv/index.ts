import { Blob } from "node:buffer";
import { arrayBuffer } from "node:stream/consumers";
import { StringDecoder } from "node:string_decoder";
import { readConfig } from "../config";
import { confirm } from "../dialogs";
import { UserError } from "../errors";
import {
	CommandLineArgsError,
	demandOneOfOption,
	printWranglerBanner,
} from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { parseJSON, readFileSync, readFileSyncToBuffer } from "../parse";
import { requireAuth } from "../user";
import { getValidBindingName } from "../utils/getValidBindingName";
import {
	createKVNamespace,
	deleteKVBulkKeyValue,
	deleteKVKeyValue,
	deleteKVNamespace,
	getKVKeyValue,
	getKVNamespaceId,
	isKVKeyValue,
	listKVNamespaceKeys,
	listKVNamespaces,
	putKVBulkKeyValue,
	putKVKeyValue,
	unexpectedKVKeyValueProps,
	usingLocalNamespace,
} from "./helpers";
import type { EventNames } from "../metrics";
import type { CommonYargsArgv } from "../yargs-types";
import type { KeyValue, NamespaceKeyInfo } from "./helpers";

export function kvNamespace(kvYargs: CommonYargsArgv) {
	return kvYargs
		.command(
			"create <namespace>",
			"🔹Create a new namespace",
			(yargs) => {
				return yargs
					.positional("namespace", {
						describe: "The name of the new namespace",
						type: "string",
						demandOption: true,
					})
					.option("preview", {
						type: "boolean",
						describe: "Interact with a preview namespace",
					});
			},
			async (args) => {
				await printWranglerBanner();

				const config = readConfig(args.config, args);
				if (!config.name) {
					logger.warn(
						"No configured name present, using `worker` as a prefix for the title"
					);
				}

				const name = config.name || "worker";
				const environment = args.env ? `-${args.env}` : "";
				const preview = args.preview ? "_preview" : "";
				const title = `${name}${environment}-${args.namespace}${preview}`;

				const accountId = await requireAuth(config);

				// TODO: generate a binding name stripping non alphanumeric chars

				logger.log(`🌀 Creating namespace with title "${title}"`);
				const namespaceId = await createKVNamespace(accountId, title);
				await metrics.sendMetricsEvent("create kv namespace", {
					sendMetrics: config.send_metrics,
				});

				logger.log("✨ Success!");
				const envString = args.env ? ` under [env.${args.env}]` : "";
				const previewString = args.preview ? "preview_" : "";
				logger.log(
					`Add the following to your configuration file in your kv_namespaces array${envString}:`
				);
				logger.log(
					`{ binding = "${getValidBindingName(
						args.namespace,
						"KV"
					)}", ${previewString}id = "${namespaceId}" }`
				);

				// TODO: automatically write this block to the wrangler.toml config file??
			}
		)
		.command(
			"list",
			"🔹Output a list of all KV namespaces associated with your account id",
			(listArgs) => listArgs,
			async (args) => {
				const config = readConfig(args.config, args);

				const accountId = await requireAuth(config);

				// TODO: we should show bindings if they exist for given ids

				logger.log(
					JSON.stringify(await listKVNamespaces(accountId), null, "  ")
				);
				await metrics.sendMetricsEvent("list kv namespaces", {
					sendMetrics: config.send_metrics,
				});
			}
		)
		.command(
			"delete",
			"🔹Delete a given namespace.",
			(yargs) => {
				return yargs
					.option("binding", {
						type: "string",
						requiresArg: true,
						describe: "The name of the namespace to delete",
					})
					.option("namespace-id", {
						type: "string",
						requiresArg: true,
						describe: "The id of the namespace to delete",
					})
					.check(demandOneOfOption("binding", "namespace-id"))
					.option("preview", {
						type: "boolean",
						describe: "Interact with a preview namespace",
					});
			},
			async (args) => {
				await printWranglerBanner();
				const config = readConfig(args.config, args);

				let id;
				try {
					id = getKVNamespaceId(args, config);
				} catch (e) {
					throw new CommandLineArgsError(
						"Not able to delete namespace.\n" + ((e as Error).message ?? e)
					);
				}

				const accountId = await requireAuth(config);

				logger.log(`Deleting KV namespace ${id}.`);
				await deleteKVNamespace(accountId, id);
				logger.log(`Deleted KV namespace ${id}.`);
				await metrics.sendMetricsEvent("delete kv namespace", {
					sendMetrics: config.send_metrics,
				});

				// TODO: recommend they remove it from wrangler.toml

				// test-mf wrangler kv:namespace delete --namespace-id 2a7d3d8b23fc4159b5afa489d6cfd388
				// Are you sure you want to delete namespace 2a7d3d8b23fc4159b5afa489d6cfd388? [y/n]
				// n
				// 💁  Not deleting namespace 2a7d3d8b23fc4159b5afa489d6cfd388
				// ➜  test-mf wrangler kv:namespace delete --namespace-id 2a7d3d8b23fc4159b5afa489d6cfd388
				// Are you sure you want to delete namespace 2a7d3d8b23fc4159b5afa489d6cfd388? [y/n]
				// y
				// 🌀  Deleting namespace 2a7d3d8b23fc4159b5afa489d6cfd388
				// ✨  Success
				// ⚠️  Make sure to remove this "kv-namespace" entry from your configuration file!
				// ➜  test-mf

				// TODO: do it automatically

				// TODO: delete the preview namespace as well?
			}
		);
}

export const kvKey = (kvYargs: CommonYargsArgv) => {
	return kvYargs
		.command(
			"put <key> [value]",
			"🔹Write a single key/value pair to the given namespace",
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
						describe: "Time since the UNIX epoch after which the entry expires",
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
					.option("local", {
						type: "boolean",
						describe: "Interact with local storage",
					})
					.option("persist-to", {
						type: "string",
						describe: "Directory for local persistence",
					})
					.check(demandOneOfOption("value", "path"));
			},
			async ({ key, ttl, expiration, metadata, ...args }) => {
				await printWranglerBanner();
				const config = readConfig(args.config, args);
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

				let metricEvent: EventNames;
				if (args.local) {
					await usingLocalNamespace(
						args.persistTo,
						config.configPath,
						namespaceId,
						(namespace) =>
							namespace.put(key, new Blob([value]).stream(), {
								expiration,
								expirationTtl: ttl,
								metadata,
							})
					);

					metricEvent = "write kv key-value (local)";
				} else {
					const accountId = await requireAuth(config);

					await putKVKeyValue(accountId, namespaceId, {
						key,
						value,
						expiration,
						expiration_ttl: ttl,
						metadata: metadata as KeyValue["metadata"],
					});

					metricEvent = "write kv key-value";
				}

				await metrics.sendMetricsEvent(metricEvent, {
					sendMetrics: config.send_metrics,
				});
			}
		)
		.command(
			"list",
			"🔹Output a list of all keys in a given namespace",
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
					})
					.option("local", {
						type: "boolean",
						describe: "Interact with local storage",
					})
					.option("persist-to", {
						type: "string",
						describe: "Directory for local persistence",
					});
			},
			async ({ prefix, ...args }) => {
				// TODO: support for limit+cursor (pagination)
				const config = readConfig(args.config, args);
				const namespaceId = getKVNamespaceId(args, config);

				let result: NamespaceKeyInfo[];
				let metricEvent: EventNames;
				if (args.local) {
					const listResult = await usingLocalNamespace(
						args.persistTo,
						config.configPath,
						namespaceId,
						(namespace) => namespace.list({ prefix })
					);
					result = listResult.keys as NamespaceKeyInfo[];

					metricEvent = "list kv keys (local)";
				} else {
					const accountId = await requireAuth(config);

					result = await listKVNamespaceKeys(accountId, namespaceId, prefix);
					metricEvent = "list kv keys";
				}

				logger.log(JSON.stringify(result, undefined, 2));
				await metrics.sendMetricsEvent(metricEvent, {
					sendMetrics: config.send_metrics,
				});
			}
		)
		.command(
			"get <key>",
			"🔹Read a single value by key from the given namespace",
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
					})
					.option("local", {
						type: "boolean",
						describe: "Interact with local storage",
					})
					.option("persist-to", {
						type: "string",
						describe: "Directory for local persistence",
					});
			},
			async ({ key, ...args }) => {
				const config = readConfig(args.config, args);
				const namespaceId = getKVNamespaceId(args, config);

				let bufferKVValue;
				let metricEvent: EventNames;
				if (args.local) {
					const val = await usingLocalNamespace(
						args.persistTo,
						config.configPath,
						namespaceId,
						async (namespace) => {
							const stream = await namespace.get(key, "stream");
							// Note `stream` is only valid inside this closure
							return stream === null ? null : await arrayBuffer(stream);
						}
					);

					if (val === null) {
						logger.log("Value not found");
						return;
					}

					bufferKVValue = Buffer.from(val);
					metricEvent = "read kv value (local)";
				} else {
					const accountId = await requireAuth(config);
					bufferKVValue = Buffer.from(
						await getKVKeyValue(accountId, namespaceId, key)
					);

					metricEvent = "read kv value";
				}

				if (args.text) {
					const decoder = new StringDecoder("utf8");
					logger.log(decoder.write(bufferKVValue));
				} else {
					process.stdout.write(bufferKVValue);
				}
				await metrics.sendMetricsEvent(metricEvent, {
					sendMetrics: config.send_metrics,
				});
			}
		)
		.command(
			"delete <key>",
			"🔹Remove a single key value pair from the given namespace",
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
					.option("preview", {
						type: "boolean",
						describe: "Interact with a preview namespace",
					})
					.option("local", {
						type: "boolean",
						describe: "Interact with local storage",
					})
					.option("persist-to", {
						type: "string",
						describe: "Directory for local persistence",
					});
			},
			async ({ key, ...args }) => {
				await printWranglerBanner();
				const config = readConfig(args.config, args);
				const namespaceId = getKVNamespaceId(args, config);

				logger.log(`Deleting the key "${key}" on namespace ${namespaceId}.`);

				let metricEvent: EventNames;
				if (args.local) {
					await usingLocalNamespace(
						args.persistTo,
						config.configPath,
						namespaceId,
						(namespace) => namespace.delete(key)
					);

					metricEvent = "delete kv key-value (local)";
				} else {
					const accountId = await requireAuth(config);

					await deleteKVKeyValue(accountId, namespaceId, key);
					metricEvent = "delete kv key-value";
				}
				await metrics.sendMetricsEvent(metricEvent, {
					sendMetrics: config.send_metrics,
				});
			}
		);
};

export const kvBulk = (kvYargs: CommonYargsArgv) => {
	return kvYargs
		.command(
			"put <filename>",
			"🔹Upload multiple key-value pairs to a namespace",
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
					.option("preview", {
						type: "boolean",
						describe: "Interact with a preview namespace",
					})
					.option("local", {
						type: "boolean",
						describe: "Interact with local storage",
					})
					.option("persist-to", {
						type: "string",
						describe: "Directory for local persistence",
					});
			},
			async ({ filename, ...args }) => {
				await printWranglerBanner();
				// The simplest implementation I could think of.
				// This could be made more efficient with a streaming parser/uploader
				// but we'll do that in the future if needed.

				const config = readConfig(args.config, args);
				const namespaceId = getKVNamespaceId(args, config);
				const content = parseJSON(readFileSync(filename), filename);

				if (!Array.isArray(content)) {
					throw new UserError(
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
					throw new UserError(
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

				let metricEvent: EventNames;
				if (args.local) {
					await usingLocalNamespace(
						args.persistTo,
						config.configPath,
						namespaceId,
						async (namespace) => {
							for (const value of content) {
								await namespace.put(value.key, value.value, {
									expiration: value.expiration,
									expirationTtl: value.expiration_ttl,
									metadata: value.metadata,
								});
							}
						}
					);

					metricEvent = "write kv key-values (bulk) (local)";
				} else {
					const accountId = await requireAuth(config);

					await putKVBulkKeyValue(accountId, namespaceId, content);
					metricEvent = "write kv key-values (bulk)";
				}

				await metrics.sendMetricsEvent(metricEvent, {
					sendMetrics: config.send_metrics,
				});
				logger.log("Success!");
			}
		)
		.command(
			"delete <filename>",
			"🔹Delete multiple key-value pairs from a namespace",
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
					.option("preview", {
						type: "boolean",
						describe: "Interact with a preview namespace",
					})
					.option("force", {
						type: "boolean",
						alias: "f",
						describe: "Do not ask for confirmation before deleting",
					})
					.option("local", {
						type: "boolean",
						describe: "Interact with local storage",
					})
					.option("persist-to", {
						type: "string",
						describe: "Directory for local persistence",
					});
			},
			async ({ filename, ...args }) => {
				await printWranglerBanner();
				const config = readConfig(args.config, args);
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

				const content = parseJSON(readFileSync(filename), filename) as string[];

				if (!Array.isArray(content)) {
					throw new UserError(
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
					throw new UserError(
						`Unexpected JSON input from "${filename}".\n` +
							`Expected an array of strings.\n` +
							errors.join("\n")
					);
				}

				let metricEvent: EventNames;
				if (args.local) {
					await usingLocalNamespace(
						args.persistTo,
						config.configPath,
						namespaceId,
						async (namespace) => {
							for (const key of content) await namespace.delete(key);
						}
					);

					metricEvent = "delete kv key-values (bulk) (local)";
				} else {
					const accountId = await requireAuth(config);

					await deleteKVBulkKeyValue(accountId, namespaceId, content);
					metricEvent = "delete kv key-values (bulk)";
				}

				await metrics.sendMetricsEvent(metricEvent, {
					sendMetrics: config.send_metrics,
				});

				logger.log("Success!");
			}
		);
};
