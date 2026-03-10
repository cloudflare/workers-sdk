import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateActionPinning } from "../validate-action-pinning";

describe("validateActionPinning()", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "action-pinning-")));
		mkdirSync(join(tmpDir, ".github", "workflows"), { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	function writeWorkflow(filename: string, content: string) {
		writeFileSync(
			join(tmpDir, ".github", "workflows", filename),
			content,
			"utf-8"
		);
	}

	function writeCompositeAction(actionDir: string, content: string) {
		const dir = join(tmpDir, ".github", "actions", actionDir);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "action.yml"), content, "utf-8");
	}

	it("should pass for pinned third-party actions", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: dorny/paths-filter@de90cc6fb38fc0963ad72b210f1f284cd68cea36
			`
		);
		expect(validateActionPinning(tmpDir)).toEqual([]);
	});

	it("should pass for pinned actions with a version comment", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: dorny/paths-filter@de90cc6fb38fc0963ad72b210f1f284cd68cea36 # v3
			`
		);
		expect(validateActionPinning(tmpDir)).toEqual([]);
	});

	it("should fail for third-party actions pinned to a tag", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: dorny/paths-filter@v3
			`
		);
		const errors = validateActionPinning(tmpDir);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain("dorny/paths-filter@v3");
		expect(errors[0]).toContain("not pinned to a commit SHA");
	});

	it("should fail for third-party actions pinned to a semver tag", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: Ana06/get-changed-files@v2.3.0
			`
		);
		const errors = validateActionPinning(tmpDir);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain("Ana06/get-changed-files@v2.3.0");
	});

	it("should fail for third-party actions pinned to a branch", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: changesets/action@main
			`
		);
		const errors = validateActionPinning(tmpDir);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain("changesets/action@main");
	});

	it("should skip first-party actions/* regardless of pinning", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: actions/checkout@v4
				      - uses: actions/setup-node@v4
				      - uses: actions/upload-artifact@v4
			`
		);
		expect(validateActionPinning(tmpDir)).toEqual([]);
	});

	it("should skip local actions", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: ./.github/actions/install-dependencies
			`
		);
		expect(validateActionPinning(tmpDir)).toEqual([]);
	});

	it("should report multiple errors across multiple files", () => {
		writeWorkflow(
			"a.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: foo/bar@v1
			`
		);
		writeWorkflow(
			"b.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: baz/qux@v2
				      - uses: quux/corge@latest
			`
		);
		const errors = validateActionPinning(tmpDir);
		expect(errors).toHaveLength(3);
		const joined = errors.join("\n");
		expect(joined).toContain("foo/bar@v1");
		expect(joined).toContain("baz/qux@v2");
		expect(joined).toContain("quux/corge@latest");
	});

	it("should validate composite actions in .github/actions/", () => {
		writeCompositeAction(
			"my-action",
			dedent`
				runs:
				  using: composite
				  steps:
				    - uses: unpinned/action@v1
			`
		);
		const errors = validateActionPinning(tmpDir);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain("unpinned/action@v1");
		expect(errors[0]).toContain(".github/actions/my-action/action.yml");
	});

	it("should include the correct line number in errors", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				name: Test
				on: push
				jobs:
				  build:
				    runs-on: ubuntu-latest
				    steps:
				      - uses: actions/checkout@v4
				      - uses: unpinned/action@v3
			`
		);
		const errors = validateActionPinning(tmpDir);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain(":8");
	});

	it("should handle uses without a hyphen prefix", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - name: Do something
				        uses: unpinned/action@v1
			`
		);
		const errors = validateActionPinning(tmpDir);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain("unpinned/action@v1");
	});

	it("should fail for third-party actions with no version reference at all", () => {
		writeWorkflow(
			"test.yml",
			dedent`
				jobs:
				  build:
				    steps:
				      - uses: some-org/some-action
			`
		);
		const errors = validateActionPinning(tmpDir);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain("some-org/some-action");
		expect(errors[0]).toContain("has no version reference at all");
	});

	it("should pass when there are no workflow files", () => {
		// tmpDir has the .github/workflows/ directory but no files
		expect(validateActionPinning(tmpDir)).toEqual([]);
	});
});
