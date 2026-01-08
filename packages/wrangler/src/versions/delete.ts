import { logRaw } from "@cloudflare/cli";
import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import * as metrics from "../metrics";
import { requireAuth } from "../user";

export const versionsDeleteCommand = createCommand({
	metadata: {
		description: "Delete a specific Version of your Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		"version-id": {
			describe: "The Worker Version ID to delete",
			type: "string",
			requiresArg: true,
			demandOption: true,
		},
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		yes: {
			alias: "y",
			describe: "Skip confirmation prompt",
			type: "boolean",
			default: false,
		},
		json: {
			describe: "Display output as clean JSON",
			type: "boolean",
			default: false,
		},
	},
	positionalArgs: ["version-id"],
	async handler(args, { config }) {
		metrics.sendMetricsEvent("delete worker version", {
			sendMetrics: config.send_metrics,
		});

		const accountId = await requireAuth(config);
		const workerName = args.name ?? config.name;

		if (workerName === undefined) {
			throw new UserError(
				'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: true }
			);
		}

		const versionId = args.versionId;

		if (!args.yes) {
			const confirmed = await confirm(
				`Are you sure you want to delete version ${versionId} of Worker ${workerName}?`,
				{ fallbackValue: false }
			);
			if (!confirmed) {
				if (!args.json) {
					logRaw("Deletion cancelled.");
				}
				return;
			}
		}

		// The delete endpoint uses the beta API path:
		// DELETE /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}
		await fetchResult(
			config,
			`/accounts/${accountId}/workers/workers/${workerName}/versions/${versionId}`,
			{
				method: "DELETE",
			}
		);

		if (args.json) {
			logRaw(
				JSON.stringify(
					{
						success: true,
						worker_name: workerName,
						version_id: versionId,
					},
					null,
					2
				)
			);
		} else {
			logRaw(
				`Successfully deleted version ${versionId} of Worker ${workerName}.`
			);
		}
	},
});
