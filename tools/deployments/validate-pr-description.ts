/* eslint-disable turbo/no-undeclared-env-vars */
if (require.main === module) {
	const errors = validateDescription(
		process.env.TITLE as string,
		process.env.BODY as string,
		process.env.LABELS as string,
		process.env.FILES as string
	);
	if (errors.length > 0) {
		console.error("Validation errors in PR description:");
		for (const error of errors) {
			console.error("- ", error);
		}
		if (process.env.DRAFT !== "true") {
			process.exit(1);
		} else {
			console.error("These errors must be fixed before you can merge this PR.");
			console.error(
				"When you mark this PR as ready for review the CI check will start failing."
			);
		}
	}
}

export function validateDescription(
	title: string,
	body: string,
	labels: string,
	changedFilesJson: string
) {
	const errors: string[] = [];

	console.log("PR:", title);

	const parsedLabels = JSON.parse(labels) as string[];

	if (parsedLabels.includes("skip-pr-description-validation")) {
		console.log(
			"Skipping validation because the `skip-pr-description-validation` label has been applied"
		);
		return [];
	}

	if (/- \[x\] TODO \(before merge\)/i.test(body)) {
		errors.push(
			"All TODO checkboxes in your PR description must be unchecked before merging"
		);
	}

	if (
		!(
			/- \[x\] Tests included/i.test(body) ||
			/- \[x\] Tests not necessary because: .+/i.test(body)
		)
	) {
		errors.push(
			"Your PR must include tests, or provide justification for why no tests are required"
		);
	}

	if (/- \[x\] I don't know/i.test(body)) {
		errors.push(
			"Your PR cannot be merged with a status of `I don't know` for e2e tests. When your PR is reviewed by the Wrangler team they'll decide whether e2e tests need to be run"
		);
	}

	if (
		!(
			/- \[x\] Required/i.test(body) ||
			/- \[x\] Not required because: .+/i.test(body)
		)
	) {
		errors.push(
			"Your PR must run E2E tests, or provide justification for why running them is not required"
		);
	}

	if (/- \[x\] Required/i.test(body) && !parsedLabels.includes("e2e")) {
		errors.push(
			"Since your PR requires E2E tests to be run, it needs to have the `e2e` label applied on GitHub"
		);
	}

	const changedFiles = JSON.parse(changedFilesJson) as string[];
	const changesetIncluded = changedFiles.some((f) =>
		f.startsWith(".changeset/")
	);

	if (!changesetIncluded && !parsedLabels.includes("no-changeset-required")) {
		errors.push(
			"Your PR doesn't include a changeset. Either include one (following the instructions in CONTRIBUTING.md) or add the 'no-changeset-required' label to bypass this check. Most PRs should have a changeset, so only bypass this check if you're sure that your change doesn't need one: see https://github.com/cloudflare/workers-sdk/blob/main/CONTRIBUTING.md#changesets for more details."
		);
	}

	if (
		!(
			/- \[x\] Cloudflare docs PR\(s\): https:\/\/github\.com\/cloudflare\/cloudflare-docs\/(pull|issues)\/\d+/i.test(
				body
			) || /- \[x\] Documentation not necessary because: .+/i.test(body)
		)
	) {
		errors.push(
			"Your PR must include documentation (in the form of a link to a Cloudflare Docs issue or PR), or provide justification for why no documentation is required"
		);
	}

	return errors;
}
