import { createCommand } from "../../core/create-command";
import { isLocal } from "../../utils/is-local";
import { readConfig } from "../../config";
import { getKVNamespaceId, usingLocalNamespace } from "../helpers";
import { parseJSON, readFileSync } from "../../parse";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import type { EventNames } from "../../metrics";
import { text } from "node:stream/consumers";
import { requireAuth } from "../../user";
import { getKVBulkKeyValue } from "../fetchers/getKVBulkKeyValue";
import * as metrics from "../../metrics";


export const kvBulkGetCommand = createCommand({
	metadata: {
		description: "Gets multiple key-value pairs from a namespace",
		status: "open-beta",
		owner: "Product: KV",
	},

	positionalArgs: ["filename"],
	args: {
		filename: {
			describe: "The file containing the keys to get",
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
			describe: "Interact with a preview namespace",
		},
		local: {
			type: "boolean",
			describe: "Interact with local storage",
		},
		remote: {
			type: "boolean",
			describe: "Interact with remote storage",
			conflicts: "local",
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
	},

	async handler({ filename, ...args }) {
		const localMode = isLocal(args);
		const config = readConfig(args);
		const namespaceId = getKVNamespaceId(args, config);

		const content = parseJSON(readFileSync(filename), filename) as (
			| string
			| { name: string }
			)[];

		if (!Array.isArray(content)) {
			throw new UserError(
				`Unexpected JSON input from "${filename}".\n` +
				`Expected an array of strings but got:\n${content}`,
			);
		}

		const errors: string[] = [];

		const keysToGet: string[] = [];
		for (const [index, item] of content.entries()) {
			const key = typeof item !== "string" ? item?.name : item;

			if (typeof key !== "string") {
				errors.push(
					`The item at index ${index} is type: "${typeof item}" - ${JSON.stringify(
						item,
					)}`,
				);
				continue;
			}
			keysToGet.push(key);
		}

		if (errors.length > 0) {
			throw new UserError(
				`Unexpected JSON input from "${filename}".\n` +
				`Expected an array of strings or objects with a "name" key.\n` +
				errors.join("\n"),
			);
		}

		let metricEvent: EventNames;
		if (localMode) {
			const result = await usingLocalNamespace(
				args.persistTo,
				config,
				namespaceId,
				async (namespace) => {
					const out = {} as { [key: string]: { value: string | null } };
					for (const key of keysToGet) {
						const stream = await namespace.get(key, "text");

						out[key as string] = {
							value: stream === null ? null : await text(stream),
						};
					}
					return out;
				},
			);

			process.stdout.write(JSON.stringify(result, null, 2));

			metricEvent = "get kv key-values (bulk) (local)";
		} else {
			const accountId = await requireAuth(config);

			process.stdout.write(JSON.stringify(await getKVBulkKeyValue(accountId, namespaceId, keysToGet), null, 2));

			metricEvent = "get kv key-values (bulk)";
		}

		metrics.sendMetricsEvent(metricEvent, {
			sendMetrics: config.send_metrics,
		});

		logger.log("\n\nSuccess!");
	},
});