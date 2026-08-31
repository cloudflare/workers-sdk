import { UserError } from "@cloudflare/workers-utils";
import { fetchCursorPage } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { fetchLocalResult, localWorkflowArgs } from "../../local";
import {
	emojifyInstanceStatus,
	validateInstanceDate,
	validateStatus,
} from "../../utils";
import type { Instance } from "../../types";

/**
 * Normalises the `--date-start` / `--date-end` pair to UTC ISO 8601 strings,
 * rejecting a range that ends before it starts.
 */
function validateDateRange(
	rawDateStart: string | undefined,
	rawDateEnd: string | undefined
): { dateStart: string | undefined; dateEnd: string | undefined } {
	const dateStart =
		rawDateStart === undefined
			? undefined
			: validateInstanceDate(rawDateStart, "--date-start", "start");
	const dateEnd =
		rawDateEnd === undefined
			? undefined
			: validateInstanceDate(rawDateEnd, "--date-end", "end");

	if (
		dateStart !== undefined &&
		dateEnd !== undefined &&
		Date.parse(dateStart) > Date.parse(dateEnd)
	) {
		throw new UserError(
			`--date-start (${dateStart}) must not be after --date-end (${dateEnd}). Update --date-start or --date-end so --date-start is before or equal to --date-end.`,
			{ telemetryMessage: "workflows instances list inverted date range" }
		);
	}

	return { dateStart, dateEnd };
}

export const workflowsInstancesListCommand = createCommand({
	metadata: {
		description:
			"Instance related commands (list, describe, terminate, pause, resume)",
		owner: "Product: Workflows",
		status: "stable",
	},
	positionalArgs: ["name"],
	args: {
		...localWorkflowArgs,
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
		"date-start": {
			describe:
				"Only list instances created at or after this date (ISO 8601, e.g. 2026-01-01 or 2026-01-01T13:00:00Z)",
			type: "string",
			requiresArg: true,
		},
		"date-end": {
			describe:
				"Only list instances created at or before this date (ISO 8601). A date without a time covers the whole UTC day, so 2026-01-31 includes everything up to 2026-01-31T23:59:59.999Z",
			type: "string",
			requiresArg: true,
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
		const { dateStart, dateEnd } = validateDateRange(
			args.dateStart,
			args.dateEnd
		);
		const hasFilters =
			args.status !== undefined ||
			dateStart !== undefined ||
			dateEnd !== undefined;

		if (args.local) {
			const URLParams = new URLSearchParams();

			if (args.status !== undefined) {
				const validatedStatus = validateStatus(args.status);
				URLParams.set("status", validatedStatus);
			}

			if (dateStart !== undefined) {
				URLParams.set("date_start", dateStart);
			}

			if (dateEnd !== undefined) {
				URLParams.set("date_end", dateEnd);
			}

			if (args.perPage !== undefined) {
				URLParams.set("per_page", args.perPage.toString());
			}

			URLParams.set("page", args.page.toString());

			const queryString = URLParams.toString();
			const path = `/workflows/${encodeURIComponent(args.name)}/instances${queryString ? `?${queryString}` : ""}`;

			const instances = await fetchLocalResult<
				Array<{ id: string; status?: string; created_on?: string }>
			>(args.port, path);

			if (instances.length === 0 && args.page === 1) {
				logger.warn(
					hasFilters
						? `No instances in workflow "${args.name}" matched the provided filters.`
						: `There are no instances in workflow "${args.name}". You can trigger it with "wrangler workflows trigger ${args.name} --local"`
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

			const sortedInstances = instances.sort((a, b) =>
				args.reverse
					? (a.created_on ?? "").localeCompare(b.created_on ?? "")
					: (b.created_on ?? "").localeCompare(a.created_on ?? "")
			);

			const prettierInstances = sortedInstances.map((instance) => ({
				"Instance ID": instance.id,
				Created: instance.created_on
					? new Date(instance.created_on).toLocaleString()
					: "N/A",
				Status: instance.status
					? emojifyInstanceStatus(instance.status as Instance["status"])
					: "N/A",
			}));

			logger.table(prettierInstances);
		} else {
			const accountId = await requireAuth(config);

			const URLParams = new URLSearchParams();

			if (args.status !== undefined) {
				const validatedStatus = validateStatus(args.status);
				URLParams.set("status", validatedStatus);
			}

			if (dateStart !== undefined) {
				URLParams.set("date_start", dateStart);
			}

			if (dateEnd !== undefined) {
				URLParams.set("date_end", dateEnd);
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
					hasFilters
						? `No instances in workflow "${args.name}" matched the provided filters.`
						: `There are no instances in workflow "${args.name}". You can trigger it with "wrangler workflows trigger ${args.name}"`
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
		}
	},
});
