import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { DEFAULT_NAMESPACE, listJobs } from "../client";

export const aiSearchJobsListCommand = createCommand({
	metadata: {
		description: "List indexing jobs for an AI Search instance",
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
			describe: "Number of jobs to show per page",
			type: "number",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const urlParams = new URLSearchParams();
		urlParams.set("page", args.page.toString());
		if (args.perPage !== undefined) {
			urlParams.set("per_page", args.perPage.toString());
		}

		const jobs = await listJobs(config, args.namespace, args.name, urlParams);

		if (args.json) {
			logger.log(JSON.stringify(jobs, null, 2));
			return;
		}

		if (jobs.length === 0 && args.page === 1) {
			logger.warn(
				`No indexing jobs found for AI Search instance "${args.name}" in namespace "${args.namespace}".`
			);
			return;
		}

		if (jobs.length === 0 && args.page > 1) {
			logger.warn(
				`No jobs found on page ${args.page}. Please try a smaller page number.`
			);
			return;
		}

		logger.info(
			`Showing ${jobs.length} job${jobs.length !== 1 ? "s" : ""} for instance "${args.name}" from page ${args.page}:`
		);

		logger.table(
			jobs.map((job) => ({
				id: job.id,
				source: job.source,
				description: job.description ?? "",
				started: job.started_at ?? "-",
				ended: job.ended_at ?? "-",
				end_reason: job.end_reason ?? "-",
			}))
		);
	},
});
