import { fetchResult } from "../../cfetch";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import type { Workflow } from "../types";

export const workflowsListCommand = createCommand({
	metadata: {
		description: "List Workflows associated to account",
		owner: "Product: Workflows",
		status: "stable",
		logArgs: true,
	},
	args: {
		page: {
			describe:
				'Show a sepecific page from the listing, can configure page size using "per-page"',
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Configure the maximum number of workflows to show per page",
			type: "number",
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const URLParams = new URLSearchParams();

		if (args.perPage !== undefined) {
			URLParams.set("per_page", args.perPage.toString());
		}

		URLParams.set("page", args.page.toString());

		const workflows = await fetchResult<Workflow[]>(
			config,
			`/accounts/${accountId}/workflows`,
			undefined,
			URLParams
		);

		if (workflows.length === 0 && args.page === 1) {
			logger.warn("There are no deployed Workflows in this account");
			return;
		}

		if (workflows.length === 0 && args.page > 1) {
			logger.warn(
				`No Workflows found on page ${args.page}. Please try a smaller page number.`
			);
			return;
		}

		logger.info(
			`Showing ${workflows.length} workflow${workflows.length > 1 ? "s" : ""} from page ${args.page}:`
		);

		const prettierWorkflows = workflows
			.sort((a, b) => b.created_on.localeCompare(a.created_on))
			.map((workflow) => ({
				Name: workflow.name,
				"Script name": workflow.script_name,
				"Class name": workflow.class_name,
				Created: new Date(workflow.created_on).toLocaleString(),
				Modified: new Date(workflow.modified_on).toLocaleString(),
			}));
		logger.table(prettierWorkflows);
	},
});
