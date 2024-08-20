import { instancesDescribeHandler, instancesDescribeOptions } from "./describe";
import { instancesListHandler, instancesListOptions } from "./list";
import type { CommonYargsArgv } from "../../../yargs-types";

export const instances = (args: CommonYargsArgv) => {
	return args
		.command(
			"list <name>",
			"List workflow instances",
			instancesListOptions,
			instancesListHandler
		)
		.command(
			"describe <name> <id>",
			"Describe a workflow instance - see its logs, retries and errors",
			instancesDescribeOptions,
			instancesDescribeHandler
		);
};
