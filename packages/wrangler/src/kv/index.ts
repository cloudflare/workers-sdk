import { Blob } from "node:buffer";
import { arrayBuffer } from "node:stream/consumers";
import { StringDecoder } from "node:string_decoder";
import { formatConfigSnippet, readConfig } from "../config";
import { demandOneOfOption } from "../core";
import {
	createAlias,
	createCommand,
	createNamespace,
} from "../core/create-command";
import { confirm } from "../dialogs";
import { CommandLineArgsError, UserError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { parseJSON, readFileSync, readFileSyncToBuffer } from "../parse";
import { requireAuth } from "../user";
import { getValidBindingName } from "../utils/getValidBindingName";
import {
	BATCH_MAX_ERRORS_WARNINGS,
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
import type { KeyValue, NamespaceKeyInfo } from "./helpers";

export const kvKeyAlias = createAlias({
	aliasOf: "wrangler kv key",
	metadata: {
		deprecated: true,
		deprecatedMessage:
			"The `wrangler kv:key` command is deprecated and will be removed in a future major version. Please use `wrangler kv key` instead which behaves the same.",
		hidden: true,
	},
});

export const kvNamespaceAlias = createAlias({
	aliasOf: "wrangler kv namespace",
	metadata: {
		deprecated: true,
		deprecatedMessage:
			"The `wrangler kv:namespace` command is deprecated and will be removed in a future major version. Please use `wrangler kv namespace` instead which behaves the same.",
		hidden: true,
	},
});

export const kvBulkAlias = createAlias({
	aliasOf: "wrangler kv bulk",
	metadata: {
		deprecated: true,
		deprecatedMessage:
			"The `wrangler kv:bulk` command is deprecated and will be removed in a future major version. Please use `wrangler kv bulk` instead which behaves the same.",
		hidden: true,
	},
});

export const kvNamespace = createNamespace({
	metadata: {
		description: "🗂️  Manage Workers KV Namespaces",
		status: "stable",
		owner: "Product: KV",
	},
});

export const kvNamespaceNamespace = createNamespace({
	metadata: {
		description: `Interact with your Workers KV Namespaces`,
		status: "stable",
		owner: "Product: KV",
	},
});

export const kvKeyNamespace = createNamespace({
	metadata: {
		description: `Individually manage Workers KV key-value pairs`,
		status: "stable",
		owner: "Product: KV",
	},
});

export const kvBulkNamespace = createNamespace({
	metadata: {
		description: `Interact with multiple Workers KV key-value pairs at once`,
		status: "stable",
		owner: "Product: KV",
	},
});

export const kvNamespaceCreateCommand = createCommand({
	metadata: {
		description: "Create a new namespace",
		status: "stable",
		owner: "Product: KV",
	},

	args: {
		namespace: {
			describe: "The name of the new namespace",
			type: "string",
			demandOption: true,
		},
		preview: {
			type: "boolean",
			describe: "Interact with a preview namespace",
		},
	},
	positionalArgs: ["namespace"],

	async handler(args) {
		const config = readConfig(args);
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
		metrics.sendMetricsEvent("create kv namespace", {
			sendMetrics: config.send_metrics,
		});

		logger.log("✨ Success!");
		const envString = args.env ? ` under [env.${args.env}]` : "";
		const previewString = args.preview ? "preview_" : "";
		logger.log(
			`Add the following to your configuration file in your kv_namespaces array${envString}:`
		);

		logger.log(
			formatConfigSnippet(
				{
					kv_namespaces: [
						{
							binding: getValidBindingName(args.namespace, "KV"),
							[`${previewString}id`]: namespaceId,
						},
					],
				},
				config.configPath
			)
		);
	},
});

export const kvNamespaceListCommand = createCommand({
	metadata: {
		description:
			"Output a list of all KV namespaces associated with your account id",
		status: "stable",
		owner: "Product: KV",
	},

	args: {},

	behaviour: { printBanner: false },
	async handler(args) {
		const config = readConfig(args);

		const accountId = await requireAuth(config);

		// TODO: we should show bindings if they exist for given ids

		logger.log(JSON.stringify(await listKVNamespaces(accountId), null, "  "));
		metrics.sendMetricsEvent("list kv namespaces", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const kvNamespaceDeleteCommand = createCommand({
	metadata: {
		description: "Delete a given namespace.",
		status: "stable",
		owner: "Product: KV",
	},

	args: {
		binding: {
			type: "string",
			requiresArg: true,
			describe: "The name of the namespace to delete",
		},
		"namespace-id": {
			type: "string",
			requiresArg: true,
			describe: "The id of the namespace to delete",
		},
		preview: {
			type: "boolean",
			describe: "Interact with a preview namespace",
		},
	},

	validateArgs(args) {
		demandOneOfOption("binding", "namespace-id")(args);
	},

	async handler(args) {
		const config = readConfig(args);

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
		metrics.sendMetricsEvent("delete kv namespace", {
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
	},
});

export const kvKeyPutCommand = createCommand({
	metadata: {
		description: "Write a single key/value pair to the given namespace",
		status: "stable",
		owner: "Product: KV",
	},

	positionalArgs: ["key", "value"],
	args: {
		key: {
			type: "string",
			describe: "The key to write to",
			demandOption: true,
		},
		value: {
			type: "string",
			describe: "The value to write",
		},
		binding: {
			type: "string",
			requiresArg: true,
			describe: "The binding of the namespace to write to",
		},
		"namespace-id": {
			type: "string",
			requiresArg: true,
			describe: "The id of the namespace to write to",
		},
		preview: {
			type: "boolean",
			describe: "Interact with a preview namespace",
		},
		ttl: {
			type: "number",
			describe: "Time for which the entries should be visible",
		},
		expiration: {
			type: "number",
			describe: "Time since the UNIX epoch after which the entry expires",
		},
		metadata: {
			type: "string",
			describe: "Arbitrary JSON that is associated with a key",
			coerce: (jsonStr: string): KeyValue["metadata"] => {
				try {
					return JSON.parse(jsonStr);
				} catch (_) {}
			},
		},
		path: {
			type: "string",
			requiresArg: true,
			describe: "Read value from the file at a given path",
		},
		local: {
			type: "boolean",
			describe: "Interact with local storage",
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
	},
	validateArgs(args) {
		demandOneOfOption("binding", "namespace-id")(args);
		demandOneOfOption("value", "path")(args);
	},

	async handler({ key, ttl, expiration, metadata, ...args }) {
		const config = readConfig(args);
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
				config,
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

		metrics.sendMetricsEvent(metricEvent, {
			sendMetrics: config.send_metrics,
		});
	},
});

export const kvKeyListCommand = createCommand({
	metadata: {
		description: "Output a list of all keys in a given namespace",
		status: "stable",
		owner: "Product: KV",
	},

	args: {
		binding: {
			type: "string",
			requiresArg: true,
			describe: "The name of the namespace to list",
		},
		"namespace-id": {
			type: "string",
			requiresArg: true,
			describe: "The id of the namespace to list",
		},
		preview: {
			type: "boolean",
			// In the case of listing keys we will default to non-preview mode
			default: false,
			describe: "Interact with a preview namespace",
		},
		prefix: {
			type: "string",
			requiresArg: true,
			describe: "A prefix to filter listed keys",
		},
		local: {
			type: "boolean",
			describe: "Interact with local storage",
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
	},
	validateArgs(args) {
		demandOneOfOption("binding", "namespace-id")(args);
	},

	behaviour: { printBanner: false },
	async handler({ prefix, ...args }) {
		// TODO: support for limit+cursor (pagination)
		const config = readConfig(args);
		const namespaceId = getKVNamespaceId(args, config);

		let result: NamespaceKeyInfo[];
		let metricEvent: EventNames;
		if (args.local) {
			const listResult = await usingLocalNamespace(
				args.persistTo,
				config,
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
		metrics.sendMetricsEvent(metricEvent, {
			sendMetrics: config.send_metrics,
		});
	},
});

export const kvKeyGetCommand = createCommand({
	metadata: {
		description: "Read a single value by key from the given namespace",
		status: "stable",
		owner: "Product: KV",
	},

	positionalArgs: ["key"],
	args: {
		key: {
			describe: "The key value to get.",
			type: "string",
			demandOption: true,
		},
		binding: {
			type: "string",
			requiresArg: true,
			describe: "The name of the namespace to get from",
		},
		"namespace-id": {
			type: "string",
			requiresArg: true,
			describe: "The id of the namespace to get from",
		},
		preview: {
			type: "boolean",
			// In the case of getting key values we will default to non-preview mode
			default: false,
			describe: "Interact with a preview namespace",
		},
		text: {
			type: "boolean",
			default: false,
			describe: "Decode the returned value as a utf8 string",
		},
		local: {
			type: "boolean",
			describe: "Interact with local storage",
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
	},
	validateArgs(args) {
		demandOneOfOption("binding", "namespace-id")(args);
	},

	behaviour: { printBanner: false },
	async handler({ key, ...args }) {
		const config = readConfig(args);
		const namespaceId = getKVNamespaceId(args, config);

		let bufferKVValue;
		let metricEvent: EventNames;
		if (args.local) {
			const val = await usingLocalNamespace(
				args.persistTo,
				config,
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
		metrics.sendMetricsEvent(metricEvent, {
			sendMetrics: config.send_metrics,
		});
	},
});

export const kvKeyDeleteCommand = createCommand({
	metadata: {
		description: "Remove a single key value pair from the given namespace",
		status: "stable",
		owner: "Product: KV",
	},

	positionalArgs: ["key"],
	args: {
		key: {
			describe: "The key value to delete.",
			type: "string",
			demandOption: true,
		},
		binding: {
			type: "string",
			requiresArg: true,
			describe: "The name of the namespace to delete from",
		},
		"namespace-id": {
			type: "string",
			requiresArg: true,
			describe: "The id of the namespace to delete from",
		},
		preview: {
			type: "boolean",
			describe: "Interact with a preview namespace",
		},
		local: {
			type: "boolean",
			describe: "Interact with local storage",
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
	},

	async handler({ key, ...args }) {
		const config = readConfig(args);
		const namespaceId = getKVNamespaceId(args, config);

		logger.log(`Deleting the key "${key}" on namespace ${namespaceId}.`);

		let metricEvent: EventNames;
		if (args.local) {
			await usingLocalNamespace(
				args.persistTo,
				config,
				namespaceId,
				(namespace) => namespace.delete(key)
			);

			metricEvent = "delete kv key-value (local)";
		} else {
			const accountId = await requireAuth(config);

			await deleteKVKeyValue(accountId, namespaceId, key);
			metricEvent = "delete kv key-value";
		}
		metrics.sendMetricsEvent(metricEvent, {
			sendMetrics: config.send_metrics,
		});
	},
});

export const kvBulkPutCommand = createCommand({
	metadata: {
		description: "Upload multiple key-value pairs to a namespace",
		status: "stable",
		owner: "Product: KV",
	},

	positionalArgs: ["filename"],
	args: {
		filename: {
			describe: "The file containing the key/value pairs to write",
			type: "string",
			demandOption: true,
		},
		binding: {
			type: "string",
			requiresArg: true,
			describe: "The name of the namespace to write to",
		},
		"namespace-id": {
			type: "string",
			requiresArg: true,
			describe: "The id of the namespace to write to",
		},
		preview: {
			type: "boolean",
			describe: "Interact with a preview namespace",
		},
		ttl: {
			type: "number",
			describe: "Time for which the entries should be visible",
		},
		expiration: {
			type: "number",
			describe: "Time since the UNIX epoch after which the entry expires",
		},
		metadata: {
			type: "string",
			describe: "Arbitrary JSON that is associated with a key",
			coerce: (jsonStr: string): KeyValue["metadata"] => {
				try {
					return JSON.parse(jsonStr);
				} catch (_) {}
			},
		},
		local: {
			type: "boolean",
			describe: "Interact with local storage",
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
	},

	async handler({ filename, ...args }) {
		// The simplest implementation I could think of.
		// This could be made more efficient with a streaming parser/uploader
		// but we'll do that in the future if needed.

		const config = readConfig(args);
		const namespaceId = getKVNamespaceId(args, config);
		const content = parseJSON(readFileSync(filename), filename);

		if (!Array.isArray(content)) {
			throw new UserError(
				`Unexpected JSON input from "${filename}".\n` +
					`Expected an array of key-value objects but got type "${typeof content}".`
			);
		}

		let maxNumberOfErrorsReached = false;
		const errors: string[] = [];
		let maxNumberOfWarningsReached = false;
		const warnings: string[] = [];
		for (let i = 0; i < content.length; i++) {
			const keyValue = content[i];
			if (!isKVKeyValue(keyValue) && !maxNumberOfErrorsReached) {
				if (errors.length === BATCH_MAX_ERRORS_WARNINGS) {
					maxNumberOfErrorsReached = true;
					errors.push("...");
				} else {
					errors.push(`The item at index ${i} is ${JSON.stringify(keyValue)}`);
				}
			} else {
				const props = unexpectedKVKeyValueProps(keyValue);
				if (props.length > 0 && !maxNumberOfWarningsReached) {
					if (warnings.length === BATCH_MAX_ERRORS_WARNINGS) {
						maxNumberOfWarningsReached = true;
						warnings.push("...");
					} else {
						warnings.push(
							`The item at index ${i} contains unexpected properties: ${JSON.stringify(
								props
							)}.`
						);
					}
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
				config,
				namespaceId,
				async (namespace) => {
					for (const value of content) {
						let data = value.value;
						if (value.base64) {
							data = Buffer.from(data, "base64").toString();
						}
						await namespace.put(value.key, data, {
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

		metrics.sendMetricsEvent(metricEvent, {
			sendMetrics: config.send_metrics,
		});
		logger.log("Success!");
	},
});

export const kvBulkDeleteCommand = createCommand({
	metadata: {
		description: "Delete multiple key-value pairs from a namespace",
		status: "stable",
		owner: "Product: KV",
	},

	positionalArgs: ["filename"],
	args: {
		filename: {
			describe: "The file containing the keys to delete",
			type: "string",
			demandOption: true,
		},
		binding: {
			type: "string",
			requiresArg: true,
			describe: "The name of the namespace to delete from",
		},
		"namespace-id": {
			type: "string",
			requiresArg: true,
			describe: "The id of the namespace to delete from",
		},
		preview: {
			type: "boolean",
			describe: "Interact with a preview namespace",
		},
		force: {
			type: "boolean",
			alias: "f",
			describe: "Do not ask for confirmation before deleting",
		},
		local: {
			type: "boolean",
			describe: "Interact with local storage",
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
	},

	async handler({ filename, ...args }) {
		const config = readConfig(args);
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

		const content = parseJSON(readFileSync(filename), filename) as (
			| string
			| { name: string }
		)[];

		if (!Array.isArray(content)) {
			throw new UserError(
				`Unexpected JSON input from "${filename}".\n` +
					`Expected an array of strings but got:\n${content}`
			);
		}

		const errors: string[] = [];

		const keysToDelete: string[] = [];
		for (const [index, item] of content.entries()) {
			const key = typeof item !== "string" ? item?.name : item;

			if (typeof key !== "string") {
				errors.push(
					`The item at index ${index} is type: "${typeof item}" - ${JSON.stringify(
						item
					)}`
				);
			}
			keysToDelete.push(key);
		}

		if (errors.length > 0) {
			throw new UserError(
				`Unexpected JSON input from "${filename}".\n` +
					`Expected an array of strings or objects with a "name" key.\n` +
					errors.join("\n")
			);
		}

		let metricEvent: EventNames;
		if (args.local) {
			await usingLocalNamespace(
				args.persistTo,
				config,
				namespaceId,
				async (namespace) => {
					for (const key of keysToDelete) {
						await namespace.delete(key);
					}
				}
			);

			metricEvent = "delete kv key-values (bulk) (local)";
		} else {
			const accountId = await requireAuth(config);

			await deleteKVBulkKeyValue(accountId, namespaceId, keysToDelete);
			metricEvent = "delete kv key-values (bulk)";
		}

		metrics.sendMetricsEvent(metricEvent, {
			sendMetrics: config.send_metrics,
		});

		logger.log("Success!");
	},
});
