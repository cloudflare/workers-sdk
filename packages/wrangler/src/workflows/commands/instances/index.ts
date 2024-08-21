import { instancesDescribeHandler, instancesDescribeOptions } from "./describe";
import { instancesListHandler, instancesListOptions } from "./list";
import {
	instancesTerminateHandler,
	instancesTerminateOptions,
} from "./terminate";
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
		)
		.command(
			"terminate <name> <id>",
			"Terminate a workflow instance",
			instancesTerminateOptions,
			instancesTerminateHandler
		);
};
