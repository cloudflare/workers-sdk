import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import formatLabelledValues from "../utils/render-labelled-values";
import { getNamespace, listNamespaces } from "./client";
import type { ArtifactsNamespace } from "./types";

const namespaceNameArg = {
	type: "string",
	demandOption: true,
	description: "The Artifacts namespace name",
} as const;

const jsonArg = {
	type: "boolean",
	default: false,
	description: "Return output as JSON",
} as const;

export const artifactsNamespacesNamespace = createNamespace({
	metadata: {
		description: "Manage Artifacts namespaces",
		status: "private beta",
		owner: "Product: Artifacts",
	},
});

function formatNamespaceDetails(
	namespace: ArtifactsNamespace
): Record<string, string> {
	return formatDefinedValues([
		["namespace", namespace.namespace],
		["repo_count", namespace.repo_count],
		["created_at", namespace.created_at],
		["updated_at", namespace.updated_at],
	]);
}

function formatDefinedValues(
	values: [string, string | number | undefined][]
): Record<string, string> {
	return Object.fromEntries(
		values
			.filter(
				(entry): entry is [string, string | number] => entry[1] !== undefined
			)
			.map(([key, value]) => [key, String(value)])
	);
}

export const artifactsNamespacesListCommand = createCommand({
	metadata: {
		description: "List Artifacts namespaces",
		status: "private beta",
		owner: "Product: Artifacts",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: jsonArg,
	},
	async handler({ json }, { config }) {
		const namespaces = await listNamespaces(config);

		if (json) {
			logger.json(namespaces);
			return;
		}

		if (namespaces.length === 0) {
			logger.log("No Artifacts namespaces found.");
			return;
		}

		logger.table(
			namespaces.map((namespace) => ({
				namespace: namespace.namespace,
				repo_count: String(namespace.repo_count),
				created_at: namespace.created_at,
				updated_at: namespace.updated_at,
			}))
		);
	},
});

export const artifactsNamespacesGetCommand = createCommand({
	metadata: {
		description: "Get an Artifacts namespace",
		status: "private beta",
		owner: "Product: Artifacts",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["name"],
	args: {
		name: namespaceNameArg,
		json: jsonArg,
	},
	async handler({ name, json }, { config }) {
		const namespace = await getNamespace(config, name);

		if (json) {
			logger.json(namespace);
			return;
		}

		logger.log(formatLabelledValues(formatNamespaceDetails(namespace)));
	},
});
