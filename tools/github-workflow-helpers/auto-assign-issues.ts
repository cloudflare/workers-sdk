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
		const {
			issue,
			label: { name: labelName },
		} = context.payload;

		core.info(`Processing new label: ${labelName} for issue #${issue.number}`);

		const teamConfig = TEAM_ASSIGNMENTS[labelName];
		if (!teamConfig) {
			core.info(`No team assignment found for label: ${labelName}`);
			return;
		}

		const teamAssignees = new Set(Object.values(teamConfig));
		const currentAssignees = new Set(issue.assignees?.map((a) => a.login));
		const toBeAssigned = teamAssignees.difference(currentAssignees);

		if (toBeAssigned.size === 0) {
			core.info(
				`All potential assignees are already assigned to issue. Skipping auto-assignment.`
			);
			return;
		}

		core.info(
			`Assigning to: ${new Intl.ListFormat("en").format(toBeAssigned)}`
		);

		const token = core.getInput("github_token", { required: true });
		const octokit = getOctokit(token);
		const result = await octokit.rest.issues.addAssignees({
			owner: context.repo.owner,
			repo: context.repo.repo,
			issue_number: issue.number,
			assignees: Array.from(toBeAssigned),
		});

		const assigned = new Set(result.data.assignees?.map((a) => a.login));
		const missing = toBeAssigned.difference(assigned);

		if (missing.size > 0) {
			core.warning(
				dedent`
          Not all assignees were added to the issue. They may not be collaborators on the repository.
          Missing assignees: ${new Intl.ListFormat("en").format(missing)}
        `
			);
		}

		core.info(
			`Issue assigned to ${new Intl.ListFormat("en").format(assigned)}`
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
