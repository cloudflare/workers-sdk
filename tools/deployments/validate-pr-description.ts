/* eslint-disable turbo/no-undeclared-env-vars */
if (require.main === module) {
	const errors = validateDescription(
		process.env.TITLE as string,
		process.env.BODY as string,
		process.env.LABELS as string
	);
	if (errors.length > 0) {
		console.error("Validation errors in PR description:");
		for (const error of errors) {
			console.error("- ", error);
		}
		process.exit(1);
	}
}

export function validateDescription(
	title: string,
	body: string,
	labels: string
) {
	const errors: string[] = [];

	console.log("PR:", title);
	const parsedLabels = JSON.parse(labels);

	if (parsedLabels.includes("skip-pr-description-validation")) {
		console.log(
			"Skipping validation because the `skip-pr-description-validation` label has been applied"
		);
		return [];
	}

	if (/- \[x\] TODO \(before merge\)/.test(body)) {
		errors.push(
			"All TODO checkboxes in your PR description must be unchecked before merging"
		);
	}

	if (
		!(
			/- \[x\] Tests included/.test(body) ||
			/- \[x\] Tests not necessary because: .+/.test(body)
		)
	) {
		errors.push(
			"Your PR must include tests, or provide justification for why no tests are required"
		);
	}

	if (/- \[x\] I don't know/.test(body)) {
		errors.push(
			"Your PR cannot be merged with a status of `I don't know` for e2e tests. When your PR is reviewed by the Wrangler team they'll decide whether e2e tests need to be run"
		);
	}

	if (
		!(
			/- \[x\] Required/.test(body) ||
			/- \[x\] Not required because: .+/.test(body)
		)
	) {
		errors.push(
			"Your PR must run E2E tests, or provide justification for why running them is not required"
		);
	}

	if (/- \[x\] Required/.test(body) && !parsedLabels.includes("e2e")) {
		errors.push(
			"Since your PR requires E2E tests to be run, it needs to have the `e2e` label applied on GitHub"
		);
	}

	if (
		!(
			/- \[x\] Changeset included/.test(body) ||
			/- \[x\] Changeset not necessary because: .+/.test(body)
		)
	) {
		errors.push(
			"Your PR must include a changeset, or provide justification for why no changesets are required"
		);
	}

	if (
		!(
			/- \[x\] Cloudflare docs PR\(s\): https:\/\/github\.com\/cloudflare\/cloudflare-docs\/(pull|issues)\/\d+/.test(
				body
			) || /- \[x\] Documentation not necessary because: .+/.test(body)
		)
	) {
		errors.push(
			"Your PR must include documentation (in the form of a link to a Cloudflare Docs issue or PR), or provide justification for why no documentation is required"
		);
	}

	return errors;
}
