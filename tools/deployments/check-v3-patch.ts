import { execSync } from "node:child_process";

/* eslint-disable turbo/no-undeclared-env-vars */
if (require.main === module) {
	const branchName = process.env.BRANCH_NAME;

	if (!branchName) {
		console.error("Missing BRANCH_NAME environment variables.");
		process.exit(1);
	}

	const match = branchName.match(/^v3-maintenance-(\d+)$/);

	if (!match) {
		console.error(
			`❌ Branch name "${branchName}" does not match the expected pattern "v3-maintenance-<PR_NUMBER>"`
		);
		process.exit(1);
	}

	const prNumber = match[1];

	console.log(`🔍 Checking if PR #${prNumber} is merged...`);

	try {
		const result = execSync(`gh pr view ${prNumber} --json state --jq .state`)
			.toString()
			.trim();

		if (result === "MERGED") {
			console.log(`✅ PR #${prNumber} is merged.`);
		} else {
			console.error(`❌ PR #${prNumber} is not merged.`);
			process.exit(1);
		}
	} catch (exception) {
		console.error(`❌ Failed to fetch PR #${prNumber}:`, exception);
		process.exit(1);
	}
}
