const allArtifacts = await github.rest.actions.listWorkflowRunArtifacts({
	owner: context.repo.owner,
	repo: context.repo.repo,
	run_id: context.payload.workflow_run.id,
});

for (const artifact of allArtifacts.data.artifacts) {
	// Extract the PR number from the artifact name
	const match = /^npm-package-triangle-(\d+)$/.exec(artifact.name);
	if (match) {
		fs.appendFileSync(
			process.env.GITHUB_ENV,
			`\nWORKFLOW_RUN_PR=${match[1]}` +
				`\nWORKFLOW_RUN_ID=${context.payload.workflow_run.id}`
		);
		break;
	}
}
