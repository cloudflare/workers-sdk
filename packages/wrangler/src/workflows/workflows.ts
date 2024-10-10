import { type CommonYargsArgv, type SubHelp } from "../yargs-types";
import {
	workflowDeleteHandler,
	workflowDeleteOptions,
} from "./commands/delete";
import {
	workflowDescribeHandler,
	workflowDescribeOptions,
} from "./commands/describe";
import { instances } from "./commands/instances";
import { workflowListHandler, workflowListOptions } from "./commands/list";
import {
	workflowTriggerHandler,
	workflowTriggerOptions,
} from "./commands/trigger";

const workflowsEpilog =
	"🚨 'wrangler workflows ...' commands are currently in private beta. If your account isn't authorized, your commands will fail.";

export const workflows = (yargs: CommonYargsArgv, subHelp: SubHelp) => {
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
		.command(
			"delete <name>",
			"Delete workflow - when deleting a workflow, it will also delete it's own instances",
			workflowDeleteOptions,
			workflowDeleteHandler
		)
		.command(
			"trigger <name> [params]",
			"Trigger a workflow, creating a new instance. Can optionally take a JSON string to pass a parameter into the workflow instance.",
			workflowTriggerOptions,
			workflowTriggerHandler
		)
		.command(
			"instances",
			"Instance related commands (list, describe, terminate...)",
			(instancesYargs) => {
				return instances(instancesYargs).command(subHelp);
			}
		)
		.epilog(workflowsEpilog);
};
