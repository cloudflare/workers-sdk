import { logRaw } from "@cloudflare/cli";
import { white } from "@cloudflare/cli/colors";
import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { requireAuth } from "../../../user";
import formatLabelledValues from "../../../utils/render-labelled-values";
import type { Version, Workflow } from "../types";

export const workflowsDescribeCommand = createCommand({
	metadata: {
		description: "Describe Workflow resource",
		owner: "Product: Workflows",
		status: "stable",
	},
	args: {
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const workflow = await fetchResult<Workflow>(
			config,
			`/accounts/${accountId}/workflows/${args.name}`
		);

		const versions = await fetchResult<Version[]>(
			config,
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
	},
});
