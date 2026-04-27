import { logRaw } from "@cloudflare/cli-shared-helpers";
import { white } from "@cloudflare/cli-shared-helpers/colors";
import { fetchResult } from "../../cfetch";
import { createCommand } from "../../core/create-command";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import {
	fetchLocalResult,
	localWorkflowArgs,
	type LocalWorkflowDetails,
} from "../local";
import type { Version, Workflow } from "../types";

export const workflowsDescribeCommand = createCommand({
	metadata: {
		description: "Describe Workflow resource",
		owner: "Product: Workflows",
		status: "stable",
	},
	args: {
		...localWorkflowArgs,
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (args.local) {
			const workflow = await fetchLocalResult<LocalWorkflowDetails>(
				args.port,
				`/workflows/${encodeURIComponent(args.name)}`
			);

			logRaw(
				formatLabelledValues({
					Name: workflow.name,
					"Script Name": workflow.script_name,
					"Class Name": workflow.class_name,
				})
			);

			if (workflow.instances) {
				logRaw(white("Instance Status Counts:"));
				logRaw(
					formatLabelledValues(
						Object.fromEntries(
							Object.entries(workflow.instances).map(([status, count]) => [
								status,
								String(count),
							])
						),
						{ indentationCount: 2 }
					)
				);
			}
		} else {
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
		}
	},
});
