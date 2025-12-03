import {
	existsSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
	findPackageNames,
	readChangesets,
	validateChangesets,
} from "../validate-changesets";

describe("findPackageNames()", () => {
	it("should return all the private packages which contain deploy scripts", ({
		expect,
	}) => {
		expect(findPackageNames()).toEqual(
			new Set([
				"@cloudflare/chrome-devtools-patches",
				"@cloudflare/cli",
				"@cloudflare/kv-asset-handler",
				"@cloudflare/pages-shared",
				"@cloudflare/quick-edit",
				"@cloudflare/unenv-preset",
				"@cloudflare/vitest-pool-workers",
				"@cloudflare/workers-editor-shared",
				"@cloudflare/workers-shared",
				"@cloudflare/workers-utils",
				"@cloudflare/workflows-shared",
				"@cloudflare/containers-shared",
				"@cloudflare/vite-plugin",
				"create-cloudflare",
				"@cloudflare/devprod-status-bot",
				"@cloudflare/edge-preview-authenticated-proxy",
				"@cloudflare/format-errors",
				"miniflare",
				"@cloudflare/playground-preview-worker",
				"solarflare-theme",
				"@cloudflare/turbo-r2-archive",
				"@cloudflare/workers-playground",
				"wrangler",
			])
		);
	});
});

describe("readChangesets()", () => {
	let tmpDir: string;

	beforeEach(() => {
		// Use realpath because the temporary path can point to a symlink rather than the actual path.
		tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "tools-tests")));
	});

	afterEach(() => {
		if (existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true });
		}
	});

	it("should load files from the changeset directory that look like changesets", ({
		expect,
	}) => {
		writeFileSync(resolve(tmpDir, "README.md"), "Some text");
		writeFileSync(resolve(tmpDir, ".hidden.md"), "Some text");
		writeFileSync(resolve(tmpDir, "change-set-one.md"), "Some text");
		writeFileSync(resolve(tmpDir, "change-set-two.md"), "Some text");
		writeFileSync(resolve(tmpDir, "change-set-two.md"), "Some text");
		writeFileSync(resolve(tmpDir, "config.json"), "Some text");

		const changesets = readChangesets(tmpDir);
		expect(changesets).toMatchInlineSnapshot(`
			[
			  {
			    "contents": "Some text",
			    "file": "change-set-one.md",
			  },
			  {
			    "contents": "Some text",
			    "file": "change-set-two.md",
			  },
			]
		`);
	});
});

describe("validateChangesets()", () => {
	it("should report errors for any invalid changesets", ({ expect }) => {
		const errors = validateChangesets(
			new Set(["package-a", "package-b", "package-c"]),
			[
				{
					file: "valid-one.md",
					contents: dedent`
						---
						"package-a": patch
						---

						refactor: test`,
				},
				{
					file: "valid-two.md",
					contents: dedent`
						---
						"package-b": minor
						---

						feature: test`,
				},
				{
					file: "valid-three.md",
					contents: dedent`
						---
						"package-c": minor
						---

						chore: test`,
				},
				{
					file: "valid-three.md",
					contents: dedent`
						---
						"package-c": minor
						---

						fix: test`,
				},
				{ file: "invalid-frontmatter.md", contents: "" },
				{
					file: "invalid-package.md",
					contents: dedent`
						---
						"package-invalid": minor
						---

						feat: test`,
				},
				{
					file: "invalid-type.md",
					contents: dedent`
						---
						"package-a": foo
						---

						docs: test`,
				},
			]
		);
		expect(errors).toMatchInlineSnapshot(`
			[
			  "Error: could not parse changeset - invalid frontmatter: at file "invalid-frontmatter.md"",
			  "Invalid package name "package-invalid" in changeset at "invalid-package.md".",
			  "Invalid type "foo" for package "package-a" in changeset at "invalid-type.md".",
			]
		`);
	});

	it("should report errors for major bump changesets", ({ expect }) => {
		const errors = validateChangesets(
			new Set(["package-a", "package-b", "package-c"]),
			[
				{
					file: "patch-one.md",
					contents: dedent`
						---
						"package-a": patch
						---
		  				refactor: test`,
				},
				{
					file: "minor-two.md",
					contents: dedent`
						---
						"package-b": minor
						---

						feature: test`,
				},
				{
					file: "major-three.md",
					contents: dedent`
						---
						"package-c": major
						---

						breaking change!`,
				},
			]
		);
		expect(errors).toMatchInlineSnapshot(`
			[
			  "Major version bumps are not allowed for package "package-c" in changeset at "major-three.md".",
			  "Invalid type "major" for package "package-c" in changeset at "major-three.md".",
			]
		`);
	});
});
