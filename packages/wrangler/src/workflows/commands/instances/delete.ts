import { parseJSON, readFileSync, UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import {
	fetchLocalResult,
	getLocalInstanceIdFromArgs,
	localWorkflowArgs,
} from "../../local";
import { getInstanceIdFromArgs, jsonWorkflowArgs } from "../../utils";

type WorkflowBatchDeleteResult = {
	deleted: { id: string }[];
	errors: { id: string; code: number; message: string }[];
};

export const workflowsInstancesDeleteCommand = createCommand({
	metadata: {
		description: "Delete workflow instances",
		owner: "Product: Workflows",
		status: "stable",
	},
	positionalArgs: ["name", "id"],
	args: {
		...localWorkflowArgs,
		...jsonWorkflowArgs,
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		id: {
			describe:
				"IDs of the instances - you can type 'latest' to get the latest instance and delete it",
			type: "string",
			array: true,
		},
		filename: {
			describe: "Path to a JSON file containing an array of instance IDs",
			type: "string",
		},
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},

	async handler(args, { config }) {
		let fileIds: string[] = [];
		if (args.filename) {
			const parsed = parseJSON(readFileSync(args.filename), args.filename);
			if (
				!Array.isArray(parsed) ||
				!parsed.every((id) => typeof id === "string")
			) {
				throw new UserError(
					`Unexpected JSON input from "${args.filename}". Expected an array of strings.`,
					{ telemetryMessage: "workflows batch delete invalid filename" }
				);
			}
			fileIds = parsed;
		}

		const requestedIds = [...(args.id ?? []), ...fileIds];
		if (requestedIds.length === 0) {
			throw new UserError("Provide at least one workflow instance ID", {
				telemetryMessage: "workflows batch delete no ids",
			});
		}
		if (requestedIds.length > 100) {
			throw new UserError(
				"You can delete at most 100 workflow instances at a time",
				{
					telemetryMessage: "workflows batch delete too large",
				}
			);
		}

		let ids = requestedIds;
		let result: WorkflowBatchDeleteResult;

		if (args.local) {
			if (ids.includes("latest")) {
				const latestId = await getLocalInstanceIdFromArgs(
					args.port,
					{ id: "latest", name: args.name },
					{ quiet: args.json }
				);
				ids = ids.map((id) => (id === "latest" ? latestId : id));
			}
			result = await fetchLocalResult<WorkflowBatchDeleteResult>(
				args.port,
				`/workflows/${encodeURIComponent(args.name)}/instances/batch/delete`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ instances: ids }),
				}
			);
		} else {
			const accountId = await requireAuth(config);
			if (ids.includes("latest")) {
				const latestId = await getInstanceIdFromArgs(
					accountId,
					{ id: "latest", name: args.name },
					config
				);
				ids = ids.map((id) => (id === "latest" ? latestId : id));
			}
			result = await fetchResult<WorkflowBatchDeleteResult>(
				config,
				`/accounts/${accountId}/workflows/${args.name}/instances/batch/delete`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ instances: ids }),
				}
			);
		}

		// Emitted before the error below is thrown so that a partial failure still
		// exits non-zero while the payload describing it reaches stdout.
		if (args.json) {
			logger.json(result);
			if (result.errors.length === 0) {
				return;
			}
		}

		if (!args.json && result.deleted.length > 0) {
			logger.info(
				`🗑️  Deleted workflow instances from "${args.name}": ${result.deleted.map(({ id }) => `"${id}"`).join(", ")}`
			);
		}

		if (result.errors.length > 0) {
			throw new UserError(
				`Failed to delete ${result.errors.length} workflow instance(s):\n${result.errors.map(({ id, message }) => `  - ${id}: ${message}`).join("\n")}`,
				{ telemetryMessage: "workflows batch delete partial failure" }
			);
		}
	},
});
