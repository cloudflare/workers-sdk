import { existsSync, statSync } from "fs";
import { spinner } from "@cloudflare/cli/interactive";
import degit from "degit";
import { mockSpinner } from "helpers/__tests__/mocks";
import {
	appendFile,
	directoryExists,
	readFile,
	writeFile,
} from "helpers/files";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
	addWranglerToGitIgnore,
	deriveCorrelatedArgs,
	downloadRemoteTemplate,
} from "../templates";
import type { PathLike } from "fs";
import type { C3Args, C3Context } from "types";

vi.mock("degit");
vi.mock("fs");
vi.mock("helpers/files");
vi.mock("@cloudflare/cli/interactive");

beforeEach(() => {
	mockSpinner();
});

describe("addWranglerToGitIgnore", () => {
	const writeFileResults: {
		file: string | undefined;
		content: string | undefined;
	} = { file: undefined, content: undefined };
	const appendFileResults: {
		file: string | undefined;
		content: string | undefined;
	} = { file: undefined, content: undefined };

	beforeEach(() => {
		vi.mocked(writeFile).mockImplementation((file: string, content: string) => {
			writeFileResults.file = file;
			writeFileResults.content = content;
		});
		vi.mocked(appendFile).mockImplementation(
			(file: string, content: string) => {
				appendFileResults.file = file;
				appendFileResults.content = content;
			},
		);
	});

	beforeEach(() => {
		vi.mocked(statSync).mockImplementation(
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			(path: string) => ({
				isDirectory() {
					return path.endsWith(".git");
				},
			}),
		);
		vi.mocked(existsSync).mockReset();
		vi.mocked(readFile).mockReset();
		vi.mocked(directoryExists).mockReset();
		appendFileResults.file = undefined;
		appendFileResults.content = undefined;
		writeFileResults.file = undefined;
		writeFileResults.content = undefined;
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

		expect(appendFileResults.file).toMatchInlineSnapshot(
			`"my-project/.gitignore"`,
		);
		expect(appendFileResults.content).toMatchInlineSnapshot(`
			"

			# wrangler files
			.wrangler
			.dev.vars
			"
		`);
	});

	test("should not touch the gitignore file if it already contains all wrangler files", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars
      .vscode
      .wrangler
    `,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileResults.file).toBeUndefined();
		expect(appendFileResults.content).toBeUndefined();
	});

	test("should not touch the gitignore file if contains all wrangler files (and can cope with comments)", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .wrangler # This is for wrangler
      .dev.vars # this is for wrangler and getPlatformProxy
      .vscode
    `,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileResults.file).toBeUndefined();
		expect(appendFileResults.content).toBeUndefined();
	});

	test("should append to the gitignore file the missing wrangler files when some is already present (without including the section heading)", () => {
		mockGitIgnore(
			"my-project/.gitignore",
			`
      node_modules
      .dev.vars
      .vscode`,
		);
		addWranglerToGitIgnore({
			project: { path: "my-project" },
		} as unknown as C3Context);

		expect(appendFileResults.file).toMatchInlineSnapshot(
			`"my-project/.gitignore"`,
		);
		expect(appendFileResults.content).toMatchInlineSnapshot(`
			"

			.wrangler
			"
		`);
	});

	test("when it appends to the gitignore file it doesn't include an empty line only if there was one already", () => {
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

		expect(appendFileResults.file).toMatchInlineSnapshot(
			`"my-project/.gitignore"`,
		);
		expect(appendFileResults.content).toMatchInlineSnapshot(`
			"
			.wrangler
			"
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
		expect(writeFileResults.file).toMatchInlineSnapshot(
			`"my-project/.gitignore"`,
		);
		expect(writeFileResults.content).toMatchInlineSnapshot(`""`);

		// and the correct lines were then added to it
		expect(appendFileResults.file).toMatchInlineSnapshot(
			`"my-project/.gitignore"`,
		);
		expect(appendFileResults.content).toMatchInlineSnapshot(`
			"

			# wrangler files
			.wrangler
			.dev.vars
			"
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

		expect(writeFileResults.file).toBeUndefined();
		expect(writeFileResults.content).toBeUndefined();
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

		expect(appendFileResults.file).toMatchInlineSnapshot(
			`"my-project/.gitignore"`,
		);
		expect(appendFileResults.content).toMatchInlineSnapshot(`
			"
			.dev.vars
			"
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
	function mockDegit() {
		// @ts-expect-error only clone will be used
		return vi.mocked(degit).mockReturnValue({
			clone: () => Promise.resolve(),
		});
	}

	test("should download template using degit", async () => {
		const mock = mockDegit();

		await downloadRemoteTemplate("cloudflare/workers-sdk");

		expect(mock).toBeCalled();
	});

	test("should not use a spinner", async () => {
		// Degit runs `git clone` internally which might prompt for credentials
		// A spinner will suppress the prompt and keep the CLI waiting in the cloning stage
		mockDegit();

		await downloadRemoteTemplate("cloudflare/workers-sdk");

		expect(spinner).not.toBeCalled();
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
