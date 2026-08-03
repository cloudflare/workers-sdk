import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { DEFAULT_NAMESPACE, listJobLogs } from "../client";

export const aiSearchJobsLogsCommand = createCommand({
	metadata: {
		description: "List log entries for an AI Search indexing job",
		status: "open beta",
		owner: "Product: AI Search",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the AI Search instance.",
		},
		"job-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the indexing job.",
		},
		namespace: {
			type: "string",
			alias: "n",
			default: DEFAULT_NAMESPACE,
			description: "The namespace the instance belongs to.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as clean JSON",
		},
		page: {
			describe:
				'Page number of the results, can configure page size using "per-page"',
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Number of log entries to show per page",
			type: "number",
		},
	},
	positionalArgs: ["name", "job-id"],
	async handler(args, { config }) {
		const urlParams = new URLSearchParams();
		urlParams.set("page", args.page.toString());
		if (args.perPage !== undefined) {
			urlParams.set("per_page", args.perPage.toString());
		}

		const logs = await listJobLogs(
			config,
			args.namespace,
			args.name,
			args.jobId,
			urlParams
		);

		if (args.json) {
			logger.log(JSON.stringify(logs, null, 2));
			return;
		}

		if (logs.length === 0 && args.page === 1) {
			logger.warn(`No log entries found for indexing job "${args.jobId}".`);
			return;
		}

		if (logs.length === 0 && args.page > 1) {
			logger.warn(
				`No log entries found on page ${args.page}. Please try a smaller page number.`
			);
			return;
		}

		logger.info(
			`Showing ${logs.length} log ${logs.length !== 1 ? "entries" : "entry"} for job "${args.jobId}" from page ${args.page}:`
		);

		logger.table(
			logs.map((entry) => ({
				created_at: String(entry.created_at),
				message_type: String(entry.message_type),
				message: entry.message,
			}))
		);
	},
});
