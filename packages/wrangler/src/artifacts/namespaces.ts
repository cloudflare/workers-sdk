import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import formatLabelledValues from "../utils/render-labelled-values";
import {
	createNamespace as createArtifactsNamespace,
	deleteNamespace,
	getNamespace,
	listNamespaces,
} from "./client";
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

const forceArg = {
	type: "boolean",
	alias: "y",
	default: false,
	description: "Skip confirmation",
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
		["name", namespace.name],
		["id", namespace.id],
		["created_at", namespace.created_at],
		["updated_at", namespace.updated_at],
	]);
}

function formatDefinedValues(
	values: [string, string | undefined][]
): Record<string, string> {
	return Object.fromEntries(
		values.filter((entry): entry is [string, string] => entry[1] !== undefined)
	);
}

export const artifactsNamespacesCreateCommand = createCommand({
	metadata: {
		description: "Create an Artifacts namespace",
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
		const namespace = await createArtifactsNamespace(config, name);

		if (json) {
			logger.json(namespace);
			return;
		}

		logger.log(`Created Artifacts namespace "${namespace.name}".`);
		logger.log(formatLabelledValues(formatNamespaceDetails(namespace)));
	},
});

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
				name: namespace.name,
				created_at: namespace.created_at ?? "",
				updated_at: namespace.updated_at ?? "",
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

export const artifactsNamespacesDeleteCommand = createCommand({
	metadata: {
		description: "Delete an Artifacts namespace",
		status: "private beta",
		owner: "Product: Artifacts",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	positionalArgs: ["name"],
	args: {
		name: namespaceNameArg,
		force: forceArg,
		json: jsonArg,
	},
	async handler({ name, force, json }, { config }) {
		if (!force) {
			const confirmedDeletion = await confirm(
				`Are you sure you want to delete Artifacts namespace "${name}"? This action cannot be undone.`,
				{ fallbackValue: false }
			);
			if (!confirmedDeletion) {
				logger.log("Deletion cancelled.");
				return;
			}
		}

		await deleteNamespace(config, name);

		if (json) {
			logger.json({ deleted: true, name });
			return;
		}

		logger.log(`Deleted Artifacts namespace "${name}".`);
	},
});
