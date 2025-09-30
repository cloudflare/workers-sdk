const core = require("@actions/core");
const github = require("@actions/github");

const TEAM_ASSIGNMENTS = {
	TEST: {
		em: "irvinebroque",
		pm: "irvinebroque",
	},
};

async function run() {
	try {
		const token = core.getInput("github_token", { required: true });
		const octokit = github.getOctokit(token);

		const { context } = github;

		if (
			context.eventName !== "issues" ||
			context.payload.action !== "labeled"
		) {
			core.info("Action only runs on issues labeled events");
			return;
		}

		const issue = context.payload.issue;
		const label = context.payload.label;
		const labelName = label.name;

		core.info(`Processing label: ${labelName} for issue #${issue.number}`);

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

		const assignees = [teamConfig.em, teamConfig.pm].filter(Boolean);

		if (assignees.length === 0) {
			core.warning(`No assignees configured for label: ${labelName}`);
			return;
		}

		core.info(`Assigning issue to: ${assignees.join(", ")}`);

		await octokit.rest.issues.addAssignees({
			owner: context.repo.owner,
			repo: context.repo.repo,
			issue_number: issue.number,
			assignees: assignees,
		});

		core.info(
			`Successfully assigned issue #${issue.number} to ${assignees.join(", ")}`
		);
	} catch (error) {
		core.setFailed(`Action failed: ${error.message}`);
	}
}

run();
