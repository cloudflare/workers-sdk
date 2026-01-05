import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import dedent from "ts-dedent";
import { beforeEach, describe, expect, it, vitest } from "vitest";
import {
	commitAndPush,
	generateChangesetHeader,
	generateCommitMessage,
	getPackageJsonDiff,
	parseDiffForChanges,
	writeChangeSet,
} from "../generate-dependabot-pr-changesets";
import type { Mock } from "vitest";

beforeEach(() => {
	vitest.mock("node:child_process", async () => {
		return {
			spawnSync: vitest.fn(),
		};
	});

	vitest.mock("node:fs", async () => {
		return {
			writeFileSync: vitest.fn(),
		};
	});
});

describe("getPackageJsonDiff()", () => {
	it("should call spawnSync to the appropriate git diff command", () => {
		(spawnSync as Mock).mockReturnValue({ output: [] });
		getPackageJsonDiff("/path/to/package.json");
		expect(spawnSync).toHaveBeenCalledOnce();
		expect((spawnSync as Mock).mock.lastCall).toMatchInlineSnapshot(`
			[
			  "git",
			  [
			    "diff",
			    "HEAD~1",
			    "/path/to/package.json",
			  ],
			  {
			    "encoding": "utf-8",
			  },
			]
		`);
	});

	it("should split the output into lines", () => {
		(spawnSync as Mock).mockReturnValue({
			output: ["line 1", "line 2\nline 3", "line 4"],
		});
		const diffLines = getPackageJsonDiff("/path/to/package.json");
		expect(diffLines).toMatchInlineSnapshot(`
			[
			  "line 1",
			  "line 2",
			  "line 3",
			  "line 4",
			]
		`);
	});
});

describe("parseDiffForChanges()", () => {
	it("should return a map containing the changes for each package", () => {
		const changes = parseDiffForChanges([
			`-               "package": "^0.0.1"`,
			`+               "package": "^0.0.2",`,
			`-               "@namespace/package": "1.3.4"`,
			`+               "@namespace/package": "1.4.5",`,
		]);
		expect(changes).toEqual(
			new Map([
				["package", { from: "^0.0.1", to: "^0.0.2" }],
				["@namespace/package", { from: "1.3.4", to: "1.4.5" }],
			])
		);
	});

	it("should ignore lines that do not match a change", () => {
		const changes = parseDiffForChanges(["", undefined, "random text"]);
		expect(changes.size).toBe(0);
	});
});

describe("generateChangesetHeader()", () => {
	it("should return a header with a single package and 'patch' version bump", () => {
		const header = generateChangesetHeader(["package-name"]);
		expect(header).toMatchInlineSnapshot(`
			"---
			"package-name": patch
			---"
		`);
	});

	it("should return a header with multiple packages and 'patch' version bump", () => {
		const header = generateChangesetHeader(["package-name", "another-package"]);
		expect(header).toMatchInlineSnapshot(`
			"---
			"package-name": patch
			"another-package": patch
			---"
		`);
	});
});

describe("generateCommitMessage()", () => {
	it("should return a commit message about a single changed package", () => {
		const message = generateCommitMessage(["@namespace/package"], new Map());
		expect(message).toMatchInlineSnapshot(`
			"chore: update dependencies of "@namespace/package"

			The following dependency versions have been updated:

			| Dependency | From | To |
			| ---------- | ---- | -- |"
		`);
	});

	it("should return a commit message about multiple packages", () => {
		const message = generateCommitMessage(
			["@namespace/package", "another-package"],
			new Map()
		);
		expect(message).toMatchInlineSnapshot(`
			"chore: update dependencies of "@namespace/package", "another-package"

			The following dependency versions have been updated:

			| Dependency | From | To |
			| ---------- | ---- | -- |"
		`);
	});

	it("should return a commit message containing a row for each change", () => {
		const message = generateCommitMessage(
			["package-name"],
			new Map([
				["some-package", { from: "^0.0.1", to: "^0.0.2" }],
				["@namespace/some-package", { from: "1.3.4", to: "1.4.5" }],
			])
		);

		expect(message).toMatchInlineSnapshot(`
			"chore: update dependencies of "package-name"

			The following dependency versions have been updated:

			| Dependency              | From   | To     |
			| ----------------------- | ------ | ------ |
			| some-package            | ^0.0.1 | ^0.0.2 |
			| @namespace/some-package | 1.3.4  | 1.4.5  |"
		`);
	});
});

describe("writeChangeSet()", () => {
	it("should call writeFileSync with appropriate changeset path and body", () => {
		const header = dedent`
			---
			"package-name": patch
			---`;
		const body = dedent`
		chore: update dependencies of "@namespace/package" package

		The following dependency versions have been updated:
		| Dependency              | From   | To     |
		| ----------------------- | ------ | ------ |
		| some-package            | ^0.0.1 | ^0.0.2 |
		| @namespace/some-package | 1.3.4  | 1.4.5  |
	`;
		writeChangeSet("some-prefix", "1234", header, body);
		expect(writeFileSync).toHaveBeenCalledOnce();
		expect((writeFileSync as Mock).mock.lastCall?.[0]).toMatchInlineSnapshot(
			`".changeset/some-prefix-1234.md"`
		);
		expect((writeFileSync as Mock).mock.lastCall?.[1]).toMatchInlineSnapshot(`
			"---
			"package-name": patch
			---

			chore: update dependencies of "@namespace/package" package

			The following dependency versions have been updated:
			| Dependency              | From   | To     |
			| ----------------------- | ------ | ------ |
			| some-package            | ^0.0.1 | ^0.0.2 |
			| @namespace/some-package | 1.3.4  | 1.4.5  |
			"
		`);
	});
});

describe("commitAndPush()", () => {
	it("should call spawnSync with appropriate git commands", () => {
		(spawnSync as Mock).mockReturnValue({ output: [] });
		const commitMessage = dedent`
			chore: update dependencies of "@namespace/package" package

			The following dependency versions have been updated:
			| Dependency              | From   | To     |
			| ----------------------- | ------ | ------ |
			| some-package            | ^0.0.1 | ^0.0.2 |
			| @namespace/some-package | 1.3.4  | 1.4.5  |`;
		commitAndPush(commitMessage);
		expect(spawnSync).toHaveBeenCalledTimes(3);
		expect((spawnSync as Mock).mock.calls[0]).toMatchInlineSnapshot(`
			[
			  "git",
			  [
			    "add",
			    ".changeset",
			  ],
			  {
			    "encoding": "utf-8",
			  },
			]
		`);
		expect((spawnSync as Mock).mock.calls[1]).toMatchInlineSnapshot(`
			[
			  "git",
			  [
			    "commit",
			    "-m",
			    "chore: update dependencies of "@namespace/package" package

			The following dependency versions have been updated:
			| Dependency              | From   | To     |
			| ----------------------- | ------ | ------ |
			| some-package            | ^0.0.1 | ^0.0.2 |
			| @namespace/some-package | 1.3.4  | 1.4.5  |",
			  ],
			  {
			    "encoding": "utf-8",
			  },
			]
		`);
		expect((spawnSync as Mock).mock.calls[2]).toMatchInlineSnapshot(`
			[
			  "git",
			  [
			    "push",
			  ],
			  {
			    "encoding": "utf-8",
			  },
			]
		`);
	});

	it("should call error if any git command fails", () => {
		(spawnSync as Mock).mockImplementation((git, args) => {
			const error =
				args[0] === "push" ? new Error("Failed to push") : undefined;
			return { output: [], error };
		});
		expect(() =>
			commitAndPush("commit message")
		).toThrowErrorMatchingInlineSnapshot(`[Error: Failed to push]`);
	});
});
