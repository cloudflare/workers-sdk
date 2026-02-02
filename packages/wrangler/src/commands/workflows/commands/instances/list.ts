import { fetchCursorPage } from "../../../../cfetch";
import { createCommand } from "../../../../core/create-command";
import { logger } from "../../../../logger";
import { requireAuth } from "../../../../user";
import { emojifyInstanceStatus, validateStatus } from "../../utils";
import type { Instance } from "../../types";

export const workflowsInstancesListCommand = createCommand({
	metadata: {
		description:
			"Instance related commands (list, describe, terminate, pause, resume)",
		owner: "Product: Workflows",
		status: "stable",
	},

	positionalArgs: ["name"],
	args: {
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		reverse: {
			describe: "Reverse order of the instances table",
			type: "boolean",
			default: false,
		},
		status: {
			describe:
				"Filters list by instance status (can be one of: queued, running, paused, errored, terminated, complete)",
			type: "string",
		},
		page: {
			describe:
				'Show a sepecific page from the listing, can configure page size using "per-page"',
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Configure the maximum number of instances to show per page",
			type: "number",
		},
	},

	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const URLParams = new URLSearchParams();

		if (args.status !== undefined) {
			const validatedStatus = validateStatus(args.status);
			URLParams.set("status", validatedStatus);
		}

		if (args.perPage !== undefined) {
			URLParams.set("per_page", args.perPage.toString());
		}

		URLParams.set("page", args.page.toString());

		// Note(osilva): perform pagination with cursor to list all instances (and not a best effort set,
		// due to changes in the Workflows control plane)
		const instances = await fetchCursorPage<Instance[]>(
			config,
			`/accounts/${accountId}/workflows/${args.name}/instances`,
			undefined,
			URLParams
		);

		if (instances.length === 0 && args.page === 1) {
			logger.warn(
				`There are no instances in workflow "${args.name}". You can trigger it with "wrangler workflows trigger ${args.name}"`
			);
			return;
		}

		if (instances.length === 0 && args.page > 1) {
			logger.warn(
				`No instances found on page ${args.page}. Please try a smaller page number.`
			);
			return;
		}

		logger.info(
			`Showing ${instances.length} instance${instances.length > 1 ? "s" : ""} from page ${args.page}:`
		);

		const prettierInstances = instances
			.sort((a, b) =>
				args.reverse
					? a.created_on.localeCompare(b.created_on)
					: b.created_on.localeCompare(a.created_on)
			)
			.map((instance) => ({
				"Instance ID": instance.id,
				Version: instance.version_id,
				Created: new Date(instance.created_on).toLocaleString(),
				Modified: new Date(instance.modified_on).toLocaleString(),
				Status: emojifyInstanceStatus(instance.status),
			}));

		logger.table(prettierInstances);
	},
});
