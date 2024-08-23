import { printWranglerBanner } from "../..";
import { fetchResult } from "../../cfetch";
import { readConfig } from "../../config";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { asJson } from "../../yargs-types";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { Workflow } from "../types";

export const workflowListOptions = (args: CommonYargsArgv) => {
	return asJson(args);
};

type HandlerOptions = StrictYargsOptionsToInterface<typeof workflowListOptions>;
export const workflowListHandler = async (args: HandlerOptions) => {
	await printWranglerBanner();

	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const workflows = await fetchResult<Workflow[]>(
		`/accounts/${accountId}/workflows`
	);

	if (workflows.length === 0) {
		logger.warn("There are no deployed Workflows in this account.");
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
};
