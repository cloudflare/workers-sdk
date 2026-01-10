import { describe, expect, it } from "vitest";
import { validateDescription } from "../validate-pr-description";

describe("validateDescription()", () => {
	it("should skip validation with the `skip-pr-description-validation` label", () => {
		expect(
			validateDescription("", "", '["skip-pr-description-validation"]', "[]")
		).toHaveLength(0);
	});

	it("should show errors with default template + TODOs checked", () => {
		expect(
			validateDescription(
				"",
				`Fixes #[insert GH or internal issue link(s)].

_Describe your change..._

---

<!--
Please don't delete the checkboxes <3
The following selections do not need to be completed if this PR only contains changes to .md files
-->

- Tests
  - [ ] Tests included/updated
  - [ ] Automated tests not possible - manual testing has been completed as follows:
  - [ ] Additional testing not necessary because:
- Public documentation
  - [ ] Cloudflare docs PR(s): <!--e.g. <https://github.com/cloudflare/cloudflare-docs/pull/>...-->
  - [ ] Documentation not necessary because:

<!--
Have you read our [Contributing guide](https://github.com/cloudflare/workers-sdk/blob/main/CONTRIBUTING.md)?
In particular, for non-trivial changes, please always engage on the issue or create a discussion or feature request issue first before writing your code.
-->
`,
				"[]",
				"[]"
			)
		).toMatchInlineSnapshot(`
			[
			  "Your PR must include tests, or provide justification for why no tests are required in the PR description and apply the \`no-tests\` label",
			  "Your PR doesn't include a changeset. Either include one (following the instructions in CONTRIBUTING.md) or add the 'no-changeset-required' label to bypass this check. Most PRs should have a changeset, so only bypass this check if you're sure that your change doesn't need one: see https://github.com/cloudflare/workers-sdk/blob/main/CONTRIBUTING.md#changesets for more details.",
			  "Your PR must include documentation (in the form of a link to a Cloudflare Docs issue or PR), or provide justification for why no documentation is required",
			]
		`);
	});

	it("should bypass changesets check with label", () => {
		expect(
			validateDescription(
				"",
				`Fixes #[insert GH or internal issue link(s)].

_Describe your change..._

---

<!--
Please don't delete the checkboxes <3
The following selections do not need to be completed if this PR only contains changes to .md files
-->

- Tests
  - [ ] Tests included/updated
  - [ ] Automated tests not possible - manual testing has been completed as follows:
  - [x] Additional testing not necessary because: test
- Public documentation
  - [ ] Cloudflare docs PR(s): <!--e.g. <https://github.com/cloudflare/cloudflare-docs/pull/>...-->
  - [x] Documentation not necessary because: test

<!--
Have you read our [Contributing guide](https://github.com/cloudflare/workers-sdk/blob/main/CONTRIBUTING.md)?
In particular, for non-trivial changes, please always engage on the issue or create a discussion or feature request issue first before writing your code.
-->`,
				'["no-changeset-required"]',
				"[]"
			)
		).toMatchInlineSnapshot(`[]`);
	});

	it("should accept everything included", () => {
		expect(
			validateDescription(
				"",
				`Fixes #[insert GH or internal issue link(s)].

_Describe your change..._

---

<!--
Please don't delete the checkboxes <3
The following selections do not need to be completed if this PR only contains changes to .md files
-->

- Tests
  - [x] Tests included/updated
  - [ ] Automated tests not possible - manual testing has been completed as follows:
  - [ ] Additional testing not necessary because:
- Public documentation
  - [x] Cloudflare docs PR(s): https://github.com/cloudflare/cloudflare-docs/pull/100
  - [ ] Documentation not necessary because:

<!--
Have you read our [Contributing guide](https://github.com/cloudflare/workers-sdk/blob/main/CONTRIBUTING.md)?
In particular, for non-trivial changes, please always engage on the issue or create a discussion or feature request issue first before writing your code.
-->
`,
				"[]",
				'[".changeset/hello-world.md"]'
			)
		).toHaveLength(0);
	});

	it("should accept a docs link", () => {
		expect(
			validateDescription(
				"",
				`## What this PR solves / how to test

Fixes [AA-000](https://jira.cfdata.org/browse/AA-000).

## Author has addressed the following

- Tests
  - [ ] TODO (before merge)
  - [x] Tests included/updated
  - [ ] Automated tests not possible - manual testing has been completed as follows:
  - [ ] Additional testing not necessary because:
- E2E Tests CI Job required? (Use "e2e" label or ask maintainer to run separately)
  - [ ] I don't know
  - [ ] Required
  - [x] Not required because: test
- Public documentation
  - [ ] TODO (before merge)
  - [x] Cloudflare docs PR(s): https://developers.cloudflare.com/workers/something-here/
  - [ ] Documentation not necessary because:
`,
				"[]",
				'[".changeset/hello-world.md"]'
			)
		).toHaveLength(0);
	});
});
