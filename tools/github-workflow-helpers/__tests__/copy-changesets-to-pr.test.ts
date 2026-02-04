import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	formatChangesets,
	insertChangesets,
	isDescriptionEmpty,
} from "../copy-changesets-to-pr";
import type { Changeset } from "@changesets/types";

// Read the actual PR template to keep tests in sync
const FULL_TEMPLATE = fs.readFileSync(
	path.join(__dirname, "../../../.github/pull_request_template.md"),
	"utf-8"
);

describe("isDescriptionEmpty()", () => {
	it("should return true for empty body", () => {
		expect(isDescriptionEmpty("")).toBe(true);
	});

	it("should return true for body with only whitespace", () => {
		expect(isDescriptionEmpty("   \n\n   ")).toBe(true);
	});

	it("should return true for template with only Fixes line", () => {
		expect(isDescriptionEmpty("Fixes #123")).toBe(true);
	});

	it("should return true for full template with checklist", () => {
		expect(isDescriptionEmpty(FULL_TEMPLATE)).toBe(true);
	});

	it("should return true for template with placeholder and separator", () => {
		const body = `Fixes #123

_Describe your change..._

---
`;
		expect(isDescriptionEmpty(body)).toBe(true);
	});

	it("should return false when description has custom content (2+ lines)", () => {
		const body = `Fixes #123

This is my custom description.
It has multiple lines.

---
`;
		expect(isDescriptionEmpty(body)).toBe(false);
	});

	it("should return false when user added description to template", () => {
		const body = `Fixes #456

This PR adds a new feature that does something useful.
It also fixes a bug.

---

<!-- START_CHECKLIST
Please don't delete the checkboxes <3
-->

- Tests
  - [x] Tests included/updated

END_CHECKLIST -->
`;
		expect(isDescriptionEmpty(body)).toBe(false);
	});

	it("should handle body without checklist markers", () => {
		const body = `Fixes #123

_Describe your change..._

---
`;
		expect(isDescriptionEmpty(body)).toBe(true);
	});

	it("should handle body without checklist markers but with content", () => {
		const body = `Fixes #123

This is a real description.
With multiple lines.
`;
		expect(isDescriptionEmpty(body)).toBe(false);
	});
});

describe("insertChangesets()", () => {
	const changesetContent = `**Packages:** \`wrangler\` (patch)

Fix a bug in the dev command`;

	it("should replace placeholder when present", () => {
		const body = `Fixes #123

_Describe your change..._

---
`;
		const result = insertChangesets(body, changesetContent);
		expect(result).toBe(`Fixes #123

**Packages:** \`wrangler\` (patch)

Fix a bug in the dev command

---
`);
		expect(result).not.toContain("_Describe your change..._");
	});

	it("should prepend when placeholder is not present", () => {
		const body = `Fixes #123

---
`;
		const result = insertChangesets(body, changesetContent);
		expect(result).toBe(`**Packages:** \`wrangler\` (patch)

Fix a bug in the dev command

Fixes #123

---
`);
	});

	it("should prepend to empty body", () => {
		const result = insertChangesets("", changesetContent);
		expect(result).toBe(`**Packages:** \`wrangler\` (patch)

Fix a bug in the dev command

`);
	});

	it("should replace placeholder in full template", () => {
		const result = insertChangesets(FULL_TEMPLATE, changesetContent);
		expect(result).toContain("**Packages:** `wrangler` (patch)");
		expect(result).toContain("Fix a bug in the dev command");
		expect(result).not.toContain("_Describe your change..._");
		// Should preserve the checklist
		expect(result).toContain("<!-- START_CHECKLIST");
		expect(result).toContain("END_CHECKLIST -->");
	});
});

describe("formatChangesets()", () => {
	it("should format a single changeset", () => {
		const changesets: Changeset[] = [
			{
				summary: "Fix a bug in the dev command",
				releases: [{ name: "wrangler", type: "patch" }],
			},
		];
		const result = formatChangesets(changesets);
		expect(result).toMatchInlineSnapshot(`
			"#### Changeset 1
			**Packages:** \`wrangler\` (patch)

			Fix a bug in the dev command"
		`);
	});

	it("should format multiple changesets with numbered headers", () => {
		const changesets: Changeset[] = [
			{
				summary: "Fix a bug",
				releases: [{ name: "wrangler", type: "patch" }],
			},
			{
				summary: "Add a new feature",
				releases: [{ name: "miniflare", type: "minor" }],
			},
		];
		const result = formatChangesets(changesets);
		expect(result).toMatchInlineSnapshot(`
			"#### Changeset 1
			**Packages:** \`wrangler\` (patch)

			Fix a bug

			#### Changeset 2
			**Packages:** \`miniflare\` (minor)

			Add a new feature"
		`);
	});

	it("should list multiple packages in one changeset", () => {
		const changesets: Changeset[] = [
			{
				summary: "Shared update across packages",
				releases: [
					{ name: "wrangler", type: "minor" },
					{ name: "miniflare", type: "minor" },
					{ name: "@cloudflare/vitest-pool-workers", type: "patch" },
				],
			},
		];
		const result = formatChangesets(changesets);
		expect(result).toMatchInlineSnapshot(`
			"#### Changeset 1
			**Packages:** \`wrangler\` (minor), \`miniflare\` (minor), \`@cloudflare/vitest-pool-workers\` (patch)

			Shared update across packages"
		`);
	});

	it("should handle changeset with multi-line summary", () => {
		const changesets: Changeset[] = [
			{
				summary: `Add new CLI command for database export

You can now export your D1 database to a local SQL file:

\`\`\`bash
wrangler d1 export my-database --output backup.sql
\`\`\`

This is useful for creating backups.`,
				releases: [{ name: "wrangler", type: "minor" }],
			},
		];
		const result = formatChangesets(changesets);
		expect(result).toContain("#### Changeset 1");
		expect(result).toContain("`wrangler` (minor)");
		expect(result).toContain("Add new CLI command for database export");
		expect(result).toContain("```bash");
		expect(result).toContain(
			"wrangler d1 export my-database --output backup.sql"
		);
	});

	it("should handle empty changesets array", () => {
		const result = formatChangesets([]);
		expect(result).toBe("");
	});
});
