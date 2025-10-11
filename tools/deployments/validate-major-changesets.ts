import { readFileSync } from "node:fs";
import core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import parseChangesetFile from "@changesets/parse";

if (require.main === module) {
	main().catch((err) => {
		console.error("Unexpected error:", err);
		process.exit(1);
	});
}

async function main() {
	const majorChangesets = getMajorChangesets();
	const breakingChangeLabel = core.getInput("label", { required: true });
	const hasBreakingChangeLabel = await hasLabel(breakingChangeLabel);

	if (majorChangesets.length === 0) {
		if (hasBreakingChangeLabel) {
			core.error(
				`This PR is marked with the "${breakingChangeLabel}" but does not contain any major release changesets.`
			);
			process.exit(1);
		}
	} else {
		if (!hasBreakingChangeLabel) {
			core.error(
				`This PR contains the following changesets that have major releases, but is not marked with the "${breakingChangeLabel}" label`
			);
			majorChangesets.forEach((changeset) => {
				core.info(
					` - "${changeset.file}": ${changeset.summary.split("\n")[0]}`
				);
			});
			process.exit(1);
		}
	}
}

/**
 * Returns an array of parsed changesets that contain at least one major release
 */
export function getMajorChangesets() {
	const files = JSON.parse(
		core.getInput("changes", { required: true })
	) as string[];

	const changesets = files.map((file) => ({
		file,
		...parseChangesetFile(readFileSync(file, "utf-8")),
	}));
	return changesets.filter((parsed) =>
		parsed.releases.some((r) => r.type === "major")
	);
}

/**
 * Returns true of the current issue/pr has the given label
 */
export async function hasLabel(label: string) {
	const token = core.getInput("github_token", { required: true });

	const octokit = getOctokit(token);
	const issue = await octokit.rest.issues.get({
		...context.repo,
		issue_number: context.issue.number,
	});
	return !!issue.data.labels.find(
		(l) => (typeof l !== "string" && l.name === label) || l === label
	);
}
