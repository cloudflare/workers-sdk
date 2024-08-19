import { type CommonYargsArgv } from "../yargs-types";
import {
	workflowDescribeHandler,
	workflowDescribeOptions,
} from "./commands/describe";
import { workflowListHandler, workflowListOptions } from "./commands/list";

const workflowsEpilog = "'wrangler workflows ...' commands are currently in private beta. If your account isn't authorized, your commands will fail."

export const workflows = (yargs: CommonYargsArgv) => {
	return yargs
		.command(
			"list",
			"List Workflows associated to account",
			workflowListOptions,
			workflowListHandler
		)
		.command(
			"describe <name>",
			"Describe Workflow resource",
			workflowDescribeOptions,
			workflowDescribeHandler
		)
        .epilog(workflowsEpilog);
};
