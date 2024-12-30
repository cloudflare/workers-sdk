import { fetchResult } from "../../cfetch";
import { createCommand } from "../../../../wrangler-shared/src/core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import type { Workflow } from "../types";

export const workflowsListCommand = createCommand({
	metadata: {
		description: "List Workflows associated to account",
		owner: "Product: Workflows",
		status: "open-beta",
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
			`/accounts/${accountId}/workflows`,
			undefined,
			URLParams
		);

		if (workflows.length === 0) {
			logger.warn("There are no deployed Workflows in this account");
		} else {
			// TODO(lduarte): can we improve this message once pagination is deployed
			logger.info(
				`Showing last ${workflows.length} workflow${workflows.length > 1 ? "s" : ""}:`
			);
			// sort by name and make the table head prettier by changing the keys
			const prettierWorkflows = workflows
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((workflow) => ({
					Name: workflow.name,
					"Script name": workflow.script_name,
					"Class name": workflow.class_name,
					Created: new Date(workflow.created_on).toLocaleString(),
					Modified: new Date(workflow.modified_on).toLocaleString(),
				}));
			logger.table(prettierWorkflows);
		}
	},
});
