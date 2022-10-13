import { readConfig } from "../config";
import {
	demandOneOfOption,
	printWranglerBanner,
	CommandLineArgsError,
} from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import {
	createKVNamespace,
	deleteKVNamespace,
	getKVNamespaceId,
	isValidKVNamespaceBinding,
	listKVNamespaces,
} from "./helpers";
import type { ConfigPath } from "../index";
import type { BuilderCallback, Argv } from "yargs";

export const kvNamespace: BuilderCallback<unknown, unknown> = (
	kvYargs: Argv
) => {
	return kvYargs
		.command(
			"create <namespace>",
			"Create a new namespace",
			(yargs) => {
				return yargs
					.positional("namespace", {
						describe: "The name of the new namespace",
						type: "string",
						demandOption: true,
					})
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
			async (args) => {
				await printWranglerBanner();

				if (!isValidKVNamespaceBinding(args.namespace)) {
					throw new CommandLineArgsError(
						`The namespace binding name "${args.namespace}" is invalid. It can only have alphanumeric and _ characters, and cannot begin with a number.`
					);
				}

				const config = readConfig(args.config as ConfigPath, args);
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
					`{ binding = "${args.namespace}", ${previewString}id = "${namespaceId}" }`
				);

				// TODO: automatically write this block to the wrangler.toml config file??
			}
		)
		.command(
			"list",
			"Outputs a list of all KV namespaces associated with your account id.",
			{},
			async (args) => {
				const config = readConfig(args.config as ConfigPath, args);

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
			"Deletes a given namespace.",
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
			async (args) => {
				await printWranglerBanner();
				const config = readConfig(args.config as ConfigPath, args);

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
};
