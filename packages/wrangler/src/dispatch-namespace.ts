import { fetchResult } from "./cfetch";
import { createCommand, createNamespace } from "./core/create-command";
import { logger } from "./logger";
import * as metrics from "./metrics";
import { requireAuth } from "./user";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

type Namespace = {
	namespace_id: string;
	namespace_name: string;
	created_on: string;
	created_by: string;
	modified_on: string;
	modified_by: string;
};

// Supporting Workers For Platforms
// More details at https://blog.cloudflare.com/workers-for-platforms/

/**
 * Create a dynamic dispatch namespace.
 */
async function createWorkerNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string
) {
	const namespace = await fetchResult<Namespace>(
		complianceConfig,
		`/accounts/${accountId}/workers/dispatch/namespaces`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name }),
		}
	);
	logger.log(
		`Created dispatch namespace "${name}" with ID "${namespace.namespace_id}"`
	);
}

/**
 * Delete a dynamic dispatch namespace.
 */
async function deleteWorkerNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string
) {
	await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/workers/dispatch/namespaces/${name}`,
		{ method: "DELETE" }
	);
	logger.log(`Deleted dispatch namespace "${name}"`);
}

/**
 * List all created dynamic dispatch namespaces for an account
 */
async function listWorkerNamespaces(
	complianceConfig: ComplianceConfig,
	accountId: string
) {
	logger.log(
		await fetchResult<Namespace>(
			complianceConfig,
			`/accounts/${accountId}/workers/dispatch/namespaces`,
			{
				headers: {
					"Content-Type": "application/json",
				},
			}
		)
	);
}

/**
 * Get info for a specific dynamic dispatch namespace
 */
async function getWorkerNamespaceInfo(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string
) {
	logger.log(
		await fetchResult<Namespace>(
			complianceConfig,
			`/accounts/${accountId}/workers/dispatch/namespaces/${name}`,
			{
				headers: {
					"Content-Type": "application/json",
				},
			}
		)
	);
}

/**
 * Rename a dynamic dispatch namespace
 */
async function renameWorkerNamespace(
	complianceConfig: ComplianceConfig,
	accountId: string,
	oldName: string,
	newName: string
) {
	await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/workers/dispatch/namespaces/${oldName}`,
		{
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name: newName }),
		}
	);
	logger.log(`Renamed dispatch namespace "${oldName}" to "${newName}"`);
}

export const dispatchNamespaceNamespace = createNamespace({
	metadata: {
		description: "🏗️ Manage dispatch namespaces",
		owner: "Workers: Deploy and Config",
		status: "stable",
		category: "Compute & AI",
	},
});

export const dispatchNamespaceListCommand = createCommand({
	metadata: {
		description: "List all dispatch namespaces",
		owner: "Workers: Deploy and Config",
		status: "stable",
	},
	async handler(_, { config }) {
		const accountId = await requireAuth(config);
		await listWorkerNamespaces(config, accountId);
		metrics.sendMetricsEvent("list dispatch namespaces", {
			sendMetrics: config.send_metrics,
		});
	},
});
export const dispatchNamespaceGetCommand = createCommand({
	metadata: {
		description: "Get information about a dispatch namespace",
		owner: "Workers: Deploy and Config",
		status: "stable",
	},
	args: {
		name: {
			describe: "Name of the dispatch namespace",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		await getWorkerNamespaceInfo(config, accountId, args.name);
		metrics.sendMetricsEvent("view dispatch namespace", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const dispatchNamespaceCreateCommand = createCommand({
	metadata: {
		description: "Create a dispatch namespace",
		owner: "Workers: Deploy and Config",
		status: "stable",
	},
	args: {
		name: {
			describe: "Name of the dispatch namespace",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		await createWorkerNamespace(config, accountId, args.name);
		metrics.sendMetricsEvent("create dispatch namespace", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const dispatchNamespaceDeleteCommand = createCommand({
	metadata: {
		description: "Delete a dispatch namespace",
		owner: "Workers: Deploy and Config",
		status: "stable",
	},
	args: {
		name: {
			describe: "Name of the dispatch namespace",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		await deleteWorkerNamespace(config, accountId, args.name);
		metrics.sendMetricsEvent("delete dispatch namespace", {
			sendMetrics: config.send_metrics,
		});
	},
});

export const dispatchNamespaceRenameCommand = createCommand({
	metadata: {
		description: "Rename a dispatch namespace",
		owner: "Workers: Deploy and Config",
		status: "stable",
	},
	args: {
		oldName: {
			describe: "Name of the dispatch namespace",
			type: "string",
			demandOption: true,
		},
		newName: {
			describe: "New name of the dispatch namespace",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["oldName", "newName"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		await renameWorkerNamespace(config, accountId, args.oldName, args.newName);
		metrics.sendMetricsEvent("rename dispatch namespace", {
			sendMetrics: config.send_metrics,
		});
	},
});
