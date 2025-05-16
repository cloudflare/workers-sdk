import { execSync } from "node:child_process";

/* eslint-disable turbo/no-undeclared-env-vars */
if (require.main === module) {
	const branchName = process.env.BRANCH_NAME;

	if (!branchName) {
		console.error("Missing BRANCH_NAME environment variables.");
		process.exit(1);
	}

	if (!validateBackportPR(branchName, isPullRequestMerged)) {
		process.exit(1);
	}
}

export function validateBackportPR(
	branchName: string,
	isMerged: (prNumber: string) => boolean
): boolean {
	const prNumber = extractPullRequestNumber(branchName);

	if (!prNumber) {
		console.error(
			`❌ Branch name "${branchName}" does not match the expected pattern "v3-backport-<PR_NUMBER>"`
		);
		return false;
	}

	console.log(`🔍 Checking if PR #${prNumber} is merged...`);

	try {
		if (isMerged(prNumber)) {
			console.log(`✅ PR #${prNumber} is merged.`);
			return true;
		} else {
			console.error(`❌ PR #${prNumber} is not merged.`);
			return false;
		}
	} catch (exception) {
		console.error(`❌ Failed to fetch PR #${prNumber}:`, exception);
		return false;
	}
}

export function extractPullRequestNumber(branchName: string): string | null {
	const match = branchName.match(/^v3-(maintenance|backport)-(\d+)$/);

	if (match && match[1]) {
		return match[1];
	}

	return null;
}

export function isPullRequestMerged(prNumber: string): boolean {
	const result = execSync(`gh pr view ${prNumber} --json state --jq .state`)
		.toString()
		.trim();

	return result === "MERGED";
}
