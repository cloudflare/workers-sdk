import { existsSync, statSync } from "node:fs";
import { spinner } from "@cloudflare/cli/interactive";
import degit from "degit";
import { mockSpinner } from "helpers/__tests__/mocks";
import {
	appendFile,
	directoryExists,
	readFile,
	readJSON,
	writeFile,
	writeJSON,
} from "helpers/files";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	addWranglerToGitIgnore,
	deriveCorrelatedArgs,
	downloadRemoteTemplate,
	updatePackageName,
} from "../templates";
import type { PathLike } from "node:fs";
import type { C3Args, C3Context } from "types";
import type { Mock } from "vitest";

vi.mock("degit");
vi.mock("fs");
vi.mock("helpers/files");
vi.mock("@cloudflare/cli/interactive");

describe("addWranglerToGitIgnore", () => {
	let writeFileMock: Mock;
	let appendFileMock: Mock;

	beforeEach(() => {
		vi.resetAllMocks();
		mockSpinner();

		writeFileMock = vi.mocked(writeFile);
		appendFileMock = vi.mocked(appendFile);

		vi.mocked(statSync).mockImplementation(
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			(path: string) => ({
				isDirectory() {
					return path.endsWith(".git");
				},
			}),
		);
	});

	test("should append the wrangler section to a standard gitignore file", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .vscode`,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock.mock.calls).toMatchInlineSnapshot(`
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
	test("should not touch the gitignore file if it already contains all wrangler files", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
      .vscode
      .wrangler
    `,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock).not.toHaveBeenCalled();
	});

	test("should not touch the gitignore file if contains all wrangler files (and can cope with comments)", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .wrangler # This is for wrangler
      .dev.vars* # this is for wrangler and getPlatformProxy
			!.dev.vars.example # more comments
			.env* # even more
			!.env.example # and a final one
      .vscode
    `,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock).not.toHaveBeenCalled();
	});

	test("should append to the gitignore file the missing wrangler files when some are already present (should add the section heading if including .wrangler and some others)", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars*
      .vscode`,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock.mock.calls).toMatchInlineSnapshot(`
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

	test("should append to the gitignore file the missing wrangler files when some are already present (should not add the section heading if .wrangler already exists)", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
			.wrangler
      .dev.vars*
      .vscode`,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock.mock.calls).toMatchInlineSnapshot(`
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

	test("should append to the gitignore file the missing wrangler files when some are already present (should not add the section heading if only adding .wrangler)", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
      .vscode`,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock.mock.calls).toMatchInlineSnapshot(`
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

	test("when it appends to the gitignore file it doesn't include an empty line only if there was one already", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars*
			!.dev.vars.example
			.env*
			!.env.example
      .vscode

    `,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock.mock.calls).toMatchInlineSnapshot(`
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

	test("should create the gitignore file if it didn't exist already", () => {
		// let's mock a gitignore file to be read by readFile
		mockGitIgnore("my-project/.gitignore", "");
		// but let's pretend that it doesn't exist
		vi.mocked(existsSync).mockImplementation(() => false);
		// let's also pretend that the .git directory exists
		vi.mocked(directoryExists).mockImplementation(() => true);

		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		// writeFile wrote the (empty) gitignore file
		expect(writeFileMock.mock.calls).toMatchInlineSnapshot(`
			[
			  [
			    "my-project/.gitignore",
			    "",
			  ],
			]
		`);

		// and the correct lines were then added to it
		expect(appendFileMock.mock.calls).toMatchInlineSnapshot(`
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

	test("should not create the gitignore file the project doesn't use git", () => {
		// no .gitignore file exists
		vi.mocked(existsSync).mockImplementation(() => false);
		// neither a .git directory does
		vi.mocked(directoryExists).mockImplementation(() => false);

		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(writeFileMock).not.toHaveBeenCalled();
	});

	test("should add the wildcard .dev.vars* entry even if a .dev.vars is already included", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
			.dev.vars
      .vscode
			`,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock.mock.calls).toMatchInlineSnapshot(`
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

	test("should not add the .env entries if some form of .env entries are already included", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
			.env
			.env.*
			!.env.example
			`,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock.mock.calls).toMatchInlineSnapshot(`
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

	test("should not add the .wrangler entry if a .wrangler/ is already included)", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .wrangler/ # This is for wrangler
      .vscode
    `,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileMock.mock.calls).toMatchInlineSnapshot(`
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

	function mockGitIgnore(path: string, content: string) {
		vi.mocked(existsSync).mockImplementation(
			(filePath: PathLike) => filePath === path,
		);
		vi.mocked(readFile).mockImplementation((filePath: string) =>
			filePath === path ? content.replace(/\n\s*/g, "\n") : "",
		);
	}
});
describe("downloadRemoteTemplate", () => {
	let cloneMock: Mock;

	beforeEach(() => {
		cloneMock = vi.fn().mockResolvedValue(undefined);
		vi.mocked(degit).mockReturnValue({
			clone: cloneMock,
		} as unknown as ReturnType<typeof degit>);
	});

	test("should download template using degit", async () => {
		await downloadRemoteTemplate("cloudflare/workers-sdk");

		expect(degit).toHaveBeenCalled();
		expect(cloneMock).toHaveBeenCalled();
	});

	test("should not use a spinner", async () => {
		// Degit runs `git clone` internally which might prompt for credentials
		// A spinner will suppress the prompt and keep the CLI waiting in the cloning stage
		await downloadRemoteTemplate("cloudflare/workers-sdk");

		expect(spinner).not.toHaveBeenCalled();
	});

	test("should call degit with a mode of undefined if not specified", async () => {
		await downloadRemoteTemplate("cloudflare/workers-sdk");

		expect(degit).toHaveBeenCalledWith("cloudflare/workers-sdk", {
			cache: false,
			verbose: false,
			force: true,
			mode: undefined,
		});
	});

	test("should call degit with a mode of 'git' if specified", async () => {
		await downloadRemoteTemplate("cloudflare/workers-sdk", { mode: "git" });

		expect(degit).toHaveBeenCalledWith("cloudflare/workers-sdk", {
			cache: false,
			verbose: false,
			force: true,
			mode: "git",
		});
	});

	test("should clone into the passed folder", async () => {
		await downloadRemoteTemplate("cloudflare/workers-sdk", {
			intoFolder: "/path/to/clone",
		});

		expect(cloneMock).toHaveBeenCalledWith("/path/to/clone");
	});

	test("should transform GitHub URL without path to degit format", async () => {
		await downloadRemoteTemplate(
			"https://github.com/cloudflare/workers-graphql-server",
		);

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-graphql-server",
			expect.anything(),
		);
	});

	test("should transform GitHub URL with trailing slash to degit format", async () => {
		await downloadRemoteTemplate("https://github.com/cloudflare/workers-sdk/");

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-sdk",
			expect.anything(),
		);
	});

	test("should transform GitHub URL with subdirectory to degit format", async () => {
		await downloadRemoteTemplate(
			"https://github.com/cloudflare/workers-sdk/templates/worker-r2",
		);

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-sdk/templates/worker-r2",
			expect.anything(),
		);
	});

	test("should transform GitHub URL with tree/main to degit format", async () => {
		await downloadRemoteTemplate(
			"https://github.com/cloudflare/workers-sdk/tree/main",
		);

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-sdk#main",
			expect.anything(),
		);
	});

	test("should transform GitHub URL with tree/main/subdirectory to degit format", async () => {
		await downloadRemoteTemplate(
			"https://github.com/cloudflare/workers-sdk/tree/main/templates",
		);

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-sdk/templates#main",
			expect.anything(),
		);
	});

	test("should throw error when using a branch other than main", async () => {
		await expect(
			downloadRemoteTemplate(
				"https://github.com/cloudflare/workers-sdk/tree/dev",
			),
		).rejects.toThrow(
			"Failed to clone remote template: https://github.com/cloudflare/workers-sdk/tree/dev\nUse the format \"github:<owner>/<repo>/sub/directory[#<branch>]\" to clone a specific branch other than 'main'",
		);
	});
});

describe("deriveCorrelatedArgs", () => {
	test("should derive the lang as TypeScript if `--ts` is specified", () => {
		const args: Partial<C3Args> = {
			ts: true,
		};

		deriveCorrelatedArgs(args);

		expect(args.lang).toBe("ts");
	});

	test("should derive the lang as JavaScript if `--ts=false` is specified", () => {
		const args: Partial<C3Args> = {
			ts: false,
		};

		deriveCorrelatedArgs(args);

		expect(args.lang).toBe("js");
	});

	test("should crash if both the lang and ts arguments are specified", () => {
		expect(() =>
			deriveCorrelatedArgs({
				lang: "ts",
			}),
		).not.toThrow();
		expect(() =>
			deriveCorrelatedArgs({
				ts: true,
				lang: "ts",
			}),
		).toThrow(
			"The `--ts` argument cannot be specified in conjunction with the `--lang` argument",
		);
	});
});

describe("updatePackageName", () => {
	let writeJSONMock: Mock;
	let writeFileMock: Mock;

	beforeEach(() => {
		vi.resetAllMocks();
		mockSpinner();
		writeJSONMock = vi.mocked(writeJSON);
		writeFileMock = vi.mocked(writeFile);
		vi.mocked(readFile).mockReturnValue("");
	});

	test('should update the "name" field in package.json', () => {
		const ctx = {
			project: { path: "my-project", name: "my-project" },
			args: {},
		} as unknown as C3Context;

		vi.mocked(readJSON).mockReturnValue({
			name: "<PACKAGE_NAME>",
			version: "1.0.0",
		});

		// There is no `pyproject.toml`
		vi.mocked(existsSync).mockReturnValue(false);

		updatePackageName(ctx);

		expect(writeJSONMock).toHaveBeenCalledWith(
			expect.stringContaining("package.json"),
			expect.objectContaining({ name: "my-project" }),
		);
	});

	test("it should update pyproject.toml if it exists", () => {
		const ctx = {
			project: { path: "my-project", name: "my-project" },
			args: {},
		} as unknown as C3Context;

		// There is a `pyproject.toml`
		vi.mocked(existsSync).mockReturnValue(true);

		vi.mocked(readJSON).mockReturnValue({
			name: "<PACKAGE_NAME>",
			version: "1.0.0",
		});

		vi.mocked(readFile).mockImplementation((path: string) => {
			if (path.endsWith("pyproject.toml")) {
				return `[project]
name = "<PROJECT_NAME>"
version = "0.1.0"`;
			}
			return "";
		});

		updatePackageName(ctx);

		expect(writeJSONMock).toHaveBeenCalledWith(
			expect.stringContaining("package.json"),
			expect.objectContaining({ name: "my-project" }),
		);

		expect(writeFileMock).toHaveBeenCalledWith(
			expect.stringContaining("pyproject.toml"),
			expect.stringContaining(`name = "my-project"`),
		);
	});
});
