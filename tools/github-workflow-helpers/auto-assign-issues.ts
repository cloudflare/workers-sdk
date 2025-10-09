import core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import dedent from "ts-dedent";
import type {
	IssuesLabeledEvent,
	IssuesUnlabeledEvent,
} from "@octokit/webhooks-types";

/**
 * The mapping of github issue labels to team members for assignment.
 */
const TEAM_ASSIGNMENTS: { [label: string]: { [jobRole: string]: string } } = {
	miniflare: { em: "lrapoport", pm: "mikenomitch" },
};

if (require.main === module) {
	run().catch((e) => {
		console.error(e instanceof Error ? e.stack : e);
		process.exit(1);
	});
}

async function run() {
	try {
		console.log(dedent`
			Auto Assign Issues
			==================
			`);

		if (isIssuesLabeledEvent(context.payload)) {
			const issue = context.payload.issue;
			const label = context.payload.label;
			const labelName = label.name;

			core.info(
				`Processing new label: ${labelName} for issue #${issue.number}`
			);

			// Skip if issue is already assigned
			if (issue.assignees && issue.assignees.length > 0) {
				core.info(
					`Issue #${issue.number} is already assigned. Skipping auto-assignment.`
				);
				return;
			}

			const teamConfig = TEAM_ASSIGNMENTS[labelName];

			if (!teamConfig) {
				core.info(`No team assignment found for label: ${labelName}`);
				return;
			}

			const assignees = Object.values(teamConfig);
			const assigneeList = new Intl.ListFormat("en", {
				type: "conjunction",
			}).format(assignees);

			core.info(`Assigning issue #${issue.number} to: ${assigneeList}`);

			const token = core.getInput("github_token", { required: true });
			const octokit = getOctokit(token);
			await octokit.rest.issues.addAssignees({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: issue.number,
				assignees,
			});

			core.info(
				`Successfully assigned issue #${issue.number} to ${assigneeList}`
			);
		}

		if (isIssuesUnlabeledEvent(context.payload)) {
			const issue = context.payload.issue;
			const label = context.payload.label;
			const labelName = label.name;

			core.info(
				`Processing removal of label: ${labelName} for issue #${issue.number}`
			);

			const teamConfig = TEAM_ASSIGNMENTS[labelName];
			if (!teamConfig) {
				core.info(`No team assignment found for label: ${labelName}`);
				return;
			}

			const assignees = Object.values(teamConfig);
			const assigneeList = new Intl.ListFormat("en", {
				type: "conjunction",
			}).format(assignees);

			core.info(`Unassigning issue #${issue.number} to: ${assigneeList}`);

			const token = core.getInput("github_token", { required: true });
			const octokit = getOctokit(token);
			await octokit.rest.issues.removeAssignees({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: issue.number,
				assignees,
			});

			core.info(
				`Successfully unassigned issue #${issue.number} to ${assigneeList}`
			);
		}
	} catch (error) {
		core.setFailed(
			`Action failed: ${error instanceof Error ? error.message : error}`
		);
	}
}

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

function isIssuesUnlabeledEvent(
	payload: object
): payload is Required<IssuesUnlabeledEvent> {
	return (
		payload &&
		"action" in payload &&
		payload.action === "unlabeled" &&
		"issue" in payload &&
		!!payload.issue &&
		"label" in payload &&
		!!payload.label
	);
}
