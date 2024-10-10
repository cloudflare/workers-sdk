import { instancesDescribeHandler, instancesDescribeOptions } from "./describe";
import { instancesListHandler, instancesListOptions } from "./list";
import { instancesPauseHandler, instancesPauseOptions } from "./pause";
import { instancesResumeHandler, instancesResumeOptions } from "./resume";
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
		)
		.command(
			"pause <name> <id>",
			"Pause a workflow instance",
			instancesPauseOptions,
			instancesPauseHandler
		)
		.command(
			"resume <name> <id>",
			"Resume a workflow instance",
			instancesResumeOptions,
			instancesResumeHandler
		);
};
