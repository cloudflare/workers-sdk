import { appendFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { readFileSync } from "@cloudflare/workers-utils";
import { beforeEach, describe, test, vi } from "vitest";
import {
	maybeAppendWranglerToGitIgnore,
	maybeAppendWranglerToGitIgnoreLikeFile,
} from "../gitignore";
import type { PathLike } from "node:fs";
import type { Mock } from "vitest";

vi.mock("node:fs");
vi.mock("@cloudflare/workers-utils");
vi.mock("../interactive", () => ({
	spinner: () => ({
		start: vi.fn(),
		stop: vi.fn(),
		update: vi.fn(),
	}),
}));

describe("maybeAppendWranglerToGitIgnoreLikeFile", () => {
	let writeFileSyncMock: Mock;
	let appendFileSyncMock: Mock;

	beforeEach(() => {
		vi.resetAllMocks();

		writeFileSyncMock = vi.mocked(writeFileSync);
		appendFileSyncMock = vi.mocked(appendFileSync);
	});

	test("should append the wrangler section to a standard gitignore file", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
      node_modules
      .vscode`
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "

			# wrangler files
			.wrangler
			.dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
			",
			  ],
			]
		`);
	});

	test("should not touch the file if it already contains all wrangler files", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
      .vscode
      .wrangler
    `
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock).not.toHaveBeenCalled();
	});

	test("should not touch the file if it contains all wrangler files (and can cope with comments)", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
      node_modules
      .wrangler # This is for wrangler
      .dev.vars* # this is for wrangler and getPlatformProxy
			!.dev.vars.example # more comments
			.env* # even more
			!.env.example # and a final one
      .vscode
    `
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock).not.toHaveBeenCalled();
	});

	test("should append to the file the missing wrangler files when some are already present (should add the section heading if including .wrangler and some others)", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars*
      .vscode`
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "

			# wrangler files
			.wrangler
			!.dev.vars.example
			.env*
			!.env.example
			",
			  ],
			]
		`);
	});

	test("should append to the file the missing wrangler files when some are already present (should not add the section heading if .wrangler already exists)", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
      node_modules
			.wrangler
      .dev.vars*
      .vscode`
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "

			!.dev.vars.example
			.env*
			!.env.example
			",
			  ],
			]
		`);
	});

	test("should append to the file the missing wrangler files when some are already present (should not add the section heading if only adding .wrangler)", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
      .vscode`
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "

			.wrangler
			",
			  ],
			]
		`);
	});

	test("when it appends to the file it doesn't include an empty line only if there was one already", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
      .vscode

    `
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "
			.wrangler
			",
			  ],
			]
		`);
	});

	test("should create the file if it didn't exist already", ({ expect }) => {
		mockIgnoreFile("my-project/.gitignore", "");
		// pretend that the file doesn't exist
		vi.mocked(existsSync).mockImplementation(() => false);

		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		// writeFile wrote the (empty) file
		expect(writeFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "",
			  ],
			]
		`);

		// and the correct lines were then added to it
		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "# wrangler files
			.wrangler
			.dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
			",
			  ],
			]
		`);
	});

	test("should add the wildcard .dev.vars* entry even if a .dev.vars is already included", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
      node_modules
			.dev.vars
      .vscode
			`
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "
			# wrangler files
			.wrangler
			.dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
			",
			  ],
			]
		`);
	});

	test("should not add the .env entries if some form of .env entries are already included", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
			.env
			.env.*
			!.env.example
			`
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "
			# wrangler files
			.wrangler
			.dev.vars*
			!.dev.vars.example
			",
			  ],
			]
		`);
	});

	test("should not add the .wrangler entry if a .wrangler/ is already included", ({
		expect,
	}) => {
		mockIgnoreFile(
			"my-project/.gitignore",
			`
      node_modules
      .wrangler/ # This is for wrangler
      .vscode
    `
		);
		maybeAppendWranglerToGitIgnoreLikeFile("my-project/.gitignore");

		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "
			.dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
			",
			  ],
			]
		`);
	});

	function mockIgnoreFile(path: string, content: string) {
		vi.mocked(existsSync).mockImplementation(
			(filePath: PathLike) => filePath === path
		);
		vi.mocked(readFileSync).mockImplementation((filePath: string) =>
			filePath === path ? content.replace(/\n\s*/g, "\n") : ""
		);
	}
});

describe("maybeAppendWranglerToGitIgnore", () => {
	let appendFileSyncMock: Mock;

	beforeEach(() => {
		vi.resetAllMocks();

		appendFileSyncMock = vi.mocked(appendFileSync);

		vi.mocked(statSync).mockImplementation(
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			(path: string) => ({
				isDirectory() {
					return path.endsWith(".git");
				},
			})
		);
	});

	test("should not create the gitignore file if neither the .git directory not the .gitingore file exist", ({
		expect,
	}) => {
		// no .gitignore file exists
		vi.mocked(existsSync).mockImplementation(() => false);
		// neither a .git directory does
		vi.mocked(statSync).mockImplementation(() => {
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});

		maybeAppendWranglerToGitIgnore("my-project");

		expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
		expect(appendFileSyncMock).not.toHaveBeenCalled();
	});

	test("should create a .gitignore file when .git directory exists", ({
		expect,
	}) => {
		// no .gitignore file exists
		vi.mocked(existsSync).mockImplementation(() => false);
		vi.mocked(readFileSync).mockImplementation(() => "");

		maybeAppendWranglerToGitIgnore("my-project");

		// writeFileSync created the (empty) file
		expect(vi.mocked(writeFileSync).mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "",
			  ],
			]
		`);

		// and the correct wrangler lines were appended to it
		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "# wrangler files
			.wrangler
			.dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
			",
			  ],
			]
		`);
	});

	test("should append wrangler entries when the .gitignore file exists but the .git directory does not", ({
		expect,
	}) => {
		// .gitignore exists
		vi.mocked(existsSync).mockImplementation(
			(filePath: PathLike) => filePath === "my-project/.gitignore"
		);
		vi.mocked(readFileSync).mockImplementation((filePath: string) =>
			filePath === "my-project/.gitignore" ? "\nnode_modules\n.vscode\n" : ""
		);
		// .git directory does NOT exist
		vi.mocked(statSync).mockImplementation(() => {
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});

		maybeAppendWranglerToGitIgnore("my-project");

		expect(appendFileSyncMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "
			# wrangler files
			.wrangler
			.dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
			",
			  ],
			]
		`);
	});
});
