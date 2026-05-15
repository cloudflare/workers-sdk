import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { listCatalogEntries, truncateDescription } from "./utils";
import type { Config } from "@cloudflare/workers-utils";

type ListModelsArgs = {
	author?: string;
	hideExperimental?: boolean;
	json?: boolean;
	search?: string;
	source?: number;
	task?: string;
};

export const aiModelsCommand = createCommand({
	metadata: {
		description: "Manage AI models",
		status: "stable",
		owner: "Product: AI",
	},
	behaviour: {
		printBanner: true,
	},
	async handler(_args, { config }) {
		await listModels({}, config);
	},
});

export const aiModelsListCommand = createCommand({
	metadata: {
		description: "List catalog models",
		status: "stable",
		owner: "Product: AI",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			type: "boolean",
			description: "Return output as JSON",
			default: false,
		},
		search: {
			type: "string",
			description: "Search models by name or description",
		},
		task: {
			type: "string",
			description: "Filter by task name",
		},
		author: {
			type: "string",
			description: "Filter by author",
		},
		source: {
			type: "number",
			description: "Filter by source ID",
		},
		"hide-experimental": {
			type: "boolean",
			description: "Hide experimental models",
			default: false,
		},
	},
	async handler(
		{ author, hideExperimental, json, search, source, task },
		{ config }
	) {
		await listModels(
			{ author, hideExperimental, json, search, source, task },
			config
		);
	},
});

async function listModels(
	{
		author,
		hideExperimental,
		json = false,
		search,
		source,
		task,
	}: ListModelsArgs,
	config: Config
) {
	const accountId = await requireAuth(config);
	const entries = await listCatalogEntries(config, accountId, {
		author,
		hideExperimental,
		search,
		source,
		task,
	});

	if (json) {
		logger.json(entries);
	} else if (entries.length === 0) {
		logger.log(`No models found.`);
	} else {
		logger.table(
			entries.map((entry) => ({
				model: entry.id,
				name: entry.name,
				description: truncateDescription(
					entry.description,
					entry.id.length +
						entry.name.length +
						(entry.task ? entry.task.name.length : 0) +
						10
				),
				task: entry.task ? entry.task.name : "",
			}))
		);
	}
}
