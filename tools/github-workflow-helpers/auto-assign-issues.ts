import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import dedent from "ts-dedent";
import type { IssuesLabeledEvent } from "@octokit/webhooks-types";

/**
 * The mapping of github issue labels to team members for assignment.
 */
const TEAM_ASSIGNMENTS: { [label: string]: { [jobRole: string]: string } } = {
	miniflare: { em: "lrapoport", pm: "mikenomitch" },
};

if (require.main === module) {
	run().catch((error) => {
		core.setFailed(error);
	});
}

async function run() {
	core.info(dedent`
			Auto Assign Issues
			==================
			`);

	if (isIssuesLabeledEvent(context.payload)) {
		const issue = context.payload.issue;
		const label = context.payload.label;
		const labelName = label.name;

		core.info(`Processing new label: ${labelName} for issue #${issue.number}`);

		const teamConfig = TEAM_ASSIGNMENTS[labelName];
		if (!teamConfig) {
			core.info(`No team assignment found for label: ${labelName}`);
			return;
		}

		const assignees = new Set(Object.values(teamConfig));
		for (const assignee of issue.assignees ?? []) {
			assignees.delete(assignee.login);
		}
		if (assignees.size === 0) {
			core.info(
				`All potential assignees are already assigned to issue #${issue.number}. Skipping auto-assignment.`
			);
			return;
		}

		const assigneeList = new Intl.ListFormat("en").format(assignees);
		core.info(`Assigning issue #${issue.number} to: ${assigneeList}`);

		const token = core.getInput("github_token", { required: true });
		const octokit = getOctokit(token);
		await octokit.rest.issues.addAssignees({
			owner: context.repo.owner,
			repo: context.repo.repo,
			issue_number: issue.number,
			assignees: Array.from(assignees),
		});

		core.info(
			`Successfully assigned issue #${issue.number} to ${assigneeList}`
		);
	}
}

/**
 * Type guard to check if the payload is an IssuesLabeledEvent.
 */
function isIssuesLabeledEvent(
	payload: object
): payload is Required<IssuesLabeledEvent> {
	return (
		payload &&
		"action" in payload &&
		payload.action === "labeled" &&
		"issue" in payload &&
		!!payload.issue &&
		"label" in payload &&
		!!payload.label
	);
}
