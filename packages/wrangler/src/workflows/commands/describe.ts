import { logRaw } from "@cloudflare/cli";
import { white } from "@cloudflare/cli/colors";
import { fetchResult } from "../../cfetch";
import { readConfig } from "../../config";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import {
	type CommonYargsArgv,
	type StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { Version, Workflow } from "../types";

export const workflowDescribeOptions = (args: CommonYargsArgv) => {
	return args.positional("name", {
		describe: "Name of the workflow",
		type: "string",
		demandOption: true,
	});
};

type HandlerOptions = StrictYargsOptionsToInterface<
	typeof workflowDescribeOptions
>;
export const workflowDescribeHandler = async (args: HandlerOptions) => {
	await printWranglerBanner();

	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const workflow = await fetchResult<Workflow>(
		`/accounts/${accountId}/workflows/${args.name}`
	);

	const versions = await fetchResult<Version[]>(
		`/accounts/${accountId}/workflows/${args.name}/versions`
	);

	const latestVersion = versions[0];

	logRaw(
		formatLabelledValues({
			Name: workflow.name,
			Id: workflow.id,
			"Script Name": workflow.script_name,
			"Class Name": workflow.class_name,
			"Created On": workflow.created_on,
			"Modified On": workflow.modified_on,
		})
	);
	logRaw(white("Latest Version:"));
	logRaw(
		formatLabelledValues(
			{
				Id: latestVersion.id,
				"Created On": workflow.created_on,
				"Modified On": workflow.modified_on,
			},
			{ indentationCount: 2 }
		)
	);
};
