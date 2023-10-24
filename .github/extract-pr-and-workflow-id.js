// This file is not used directly.
// Instead its contents are used in `.github/workflows/write-prerelease-comment.yml`
// Any changes here should be copied into the CI step there.
const allArtifacts = await github.rest.actions.listWorkflowRunArtifacts({
	owner: context.repo.owner,
	repo: context.repo.repo,
	run_id: context.payload.workflow_run.id,
});

for (const artifact of allArtifacts.data.artifacts) {
	// Extract the PR number from the artifact name
	const match = /^npm-package-(.+)-(\d+)$/.exec(artifact.name);
	if (match) {
		const packageName = match[1].toUpperCase();
		require("fs").appendFileSync(
			process.env.GITHUB_ENV,
			`\nWORKFLOW_RUN_PR_FOR_${packageName}=${match[2]}` +
				`\nWORKFLOW_RUN_ID_FOR_${packageName}=${context.payload.workflow_run.id}`
		);
	}
}
