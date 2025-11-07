import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import parseChangeset from "@changesets/parse";

/* eslint-disable turbo/no-undeclared-env-vars */
if (require.main === module) {
	if (isWranglerPatch(process.env.FILES as string)) {
		// Create a new branch for the v3 maintenance PR
		const branch = `v3-backport-${process.env.PR_NUMBER}`;
		execSync(`git checkout -b ${branch} -f`);

		execSync(`git rebase --onto origin/v3-maintenance origin/main ${branch}`);

		execSync(`git push origin HEAD --force`);

		try {
			// Open PR
			execSync(
				[
					`gh`,
					`pr`,
					`create`,
					`--base`,
					`v3-maintenance`,
					`--head ${branch}`,
					`--label "skip-pr-description-validation"`,
					`--label "skip-v3-pr"`,
					`--label "v3-backport"`,
					`--title "V3 Backport [#${process.env.PR_NUMBER}]: ${process.env.PR_TITLE?.slice(1, -1)}"`,
					`--body "This is an automatically opened PR to backport patch changes from #${process.env.PR_NUMBER} to Wrangler v3"`,
					`--draft`,
				].join(" ")
			);
		} catch {
			// Ignore "PR already created failures"
		}
	}
}

export function isWranglerPatch(changedFilesJson: string) {
	const changedFiles = JSON.parse(changedFilesJson) as string[];
	const changesets = changedFiles
		.filter((f) => f.startsWith(".changeset/") && existsSync(f))
		.map((c) => parseChangeset(readFileSync(c, "utf8")));

	let hasWranglerPatch = false;
	for (const changeset of changesets) {
		for (const release of changeset.releases) {
			if (release.name === "wrangler" && release.type === "patch") {
				hasWranglerPatch = true;
			}
		}
	}

	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			`has_wrangler_patch=${hasWranglerPatch ? "true" : "false"}\n`
		);
	}

	return hasWranglerPatch;
}
