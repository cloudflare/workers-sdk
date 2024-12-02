import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import parseChangeset from "@changesets/parse";

/* eslint-disable turbo/no-undeclared-env-vars */
if (require.main === module) {
	if (isWranglerPatch(process.env.FILES as string)) {
		// Create a new branch for the v3 maintenance PR
		execSync(`git checkout -b v3-maintenance-${process.env.PR_NUMBER} -f`);

		execSync(`git push origin HEAD --force`);

		try {
			// Open PR
			execSync(
				`gh pr create --head v3-maintenance-${process.env.PR_NUMBER} --label "skip-pr-description-validation" --title "Backport #${process.env.PR_NUMBER} to Wrangler v3" --body "This is an automatically opened PR to backport patch changes from #${process.env.PR_NUMBER} to Wrangler v3"`
			);
		} catch {
			// Ignore "PR already created failures"
		}
	}
}

export function isWranglerPatch(changedFilesJson: string) {
	const changedFiles = JSON.parse(changedFilesJson) as string[];
	const changesets = changedFiles
		.filter((f) => f.startsWith(".changeset/"))
		.map((c) => parseChangeset(readFileSync(c, "utf8")));

	let hasWranglerPatch = false;
	for (const changeset of changesets) {
		for (const release of changeset.releases) {
			if (release.name === "wrangler" && release.type === "patch") {
				hasWranglerPatch = true;
			}
		}
	}
	return hasWranglerPatch;
}
