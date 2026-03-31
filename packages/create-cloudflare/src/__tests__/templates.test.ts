import { existsSync } from "node:fs";
import { join } from "node:path";
import { spinner } from "@cloudflare/cli/interactive";
import degit from "degit";
import { mockSpinner } from "helpers/__tests__/mocks";
import { readFile, readJSON, writeFile, writeJSON } from "helpers/files";
import { beforeEach, describe, test, vi } from "vitest";
import { getAgentsMd } from "../agents-md";
import {
	deriveCorrelatedArgs,
	downloadRemoteTemplate,
	updatePackageName,
	writeAgentsMd,
} from "../templates";
import type { C3Args, C3Context } from "types";
import type { Mock } from "vitest";

vi.mock("degit");
vi.mock("fs");
vi.mock("helpers/files");
vi.mock("@cloudflare/cli/interactive");

describe("downloadRemoteTemplate", () => {
	let cloneMock: Mock;

	beforeEach(() => {
		cloneMock = vi.fn().mockResolvedValue(undefined);
		vi.mocked(degit).mockReturnValue({
			clone: cloneMock,
		} as unknown as ReturnType<typeof degit>);
	});

	test("should download template using degit", async ({ expect }) => {
		await downloadRemoteTemplate("cloudflare/workers-sdk");

		expect(degit).toHaveBeenCalled();
		expect(cloneMock).toHaveBeenCalled();
	});

	test("should not use a spinner", async ({ expect }) => {
		// Degit runs `git clone` internally which might prompt for credentials
		// A spinner will suppress the prompt and keep the CLI waiting in the cloning stage
		await downloadRemoteTemplate("cloudflare/workers-sdk");

		expect(spinner).not.toHaveBeenCalled();
	});

	test("should call degit with a mode of undefined if not specified", async ({
		expect,
	}) => {
		await downloadRemoteTemplate("cloudflare/workers-sdk");

		expect(degit).toHaveBeenCalledWith("cloudflare/workers-sdk", {
			cache: false,
			verbose: false,
			force: true,
			mode: undefined,
		});
	});

	test("should call degit with a mode of 'git' if specified", async ({
		expect,
	}) => {
		await downloadRemoteTemplate("cloudflare/workers-sdk", { mode: "git" });

		expect(degit).toHaveBeenCalledWith("cloudflare/workers-sdk", {
			cache: false,
			verbose: false,
			force: true,
			mode: "git",
		});
	});

	test("should clone into the passed folder", async ({ expect }) => {
		await downloadRemoteTemplate("cloudflare/workers-sdk", {
			intoFolder: "/path/to/clone",
		});

		expect(cloneMock).toHaveBeenCalledWith("/path/to/clone");
	});

	test("should transform GitHub URL without path to degit format", async ({
		expect,
	}) => {
		await downloadRemoteTemplate(
			"https://github.com/cloudflare/workers-graphql-server"
		);

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-graphql-server",
			expect.anything()
		);
	});

	test("should transform GitHub URL with trailing slash to degit format", async ({
		expect,
	}) => {
		await downloadRemoteTemplate("https://github.com/cloudflare/workers-sdk/");

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-sdk",
			expect.anything()
		);
	});

	test("should transform GitHub URL with subdirectory to degit format", async ({
		expect,
	}) => {
		await downloadRemoteTemplate(
			"https://github.com/cloudflare/workers-sdk/templates/worker-r2"
		);

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-sdk/templates/worker-r2",
			expect.anything()
		);
	});

	test("should transform GitHub URL with tree/main to degit format", async ({
		expect,
	}) => {
		await downloadRemoteTemplate(
			"https://github.com/cloudflare/workers-sdk/tree/main"
		);

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-sdk#main",
			expect.anything()
		);
	});

	test("should transform GitHub URL with tree/main/subdirectory to degit format", async ({
		expect,
	}) => {
		await downloadRemoteTemplate(
			"https://github.com/cloudflare/workers-sdk/tree/main/templates"
		);

		expect(degit).toHaveBeenCalledWith(
			"github:cloudflare/workers-sdk/templates#main",
			expect.anything()
		);
	});

	test("should throw error when using a branch other than main", async ({
		expect,
	}) => {
		await expect(
			downloadRemoteTemplate(
				"https://github.com/cloudflare/workers-sdk/tree/dev"
			)
		).rejects.toThrow(
			"Failed to clone remote template: https://github.com/cloudflare/workers-sdk/tree/dev\nUse the format \"github:<owner>/<repo>/sub/directory[#<branch>]\" to clone a specific branch other than 'main'"
		);
	});
});

describe("deriveCorrelatedArgs", () => {
	test("should derive the lang as TypeScript if `--ts` is specified", ({
		expect,
	}) => {
		const args: Partial<C3Args> = {
			ts: true,
		};

		deriveCorrelatedArgs(args);

		expect(args.lang).toBe("ts");
	});

	test("should derive the lang as JavaScript if `--ts=false` is specified", ({
		expect,
	}) => {
		const args: Partial<C3Args> = {
			ts: false,
		};

		deriveCorrelatedArgs(args);

		expect(args.lang).toBe("js");
	});

	test("should crash if both the lang and ts arguments are specified", ({
		expect,
	}) => {
		expect(() =>
			deriveCorrelatedArgs({
				lang: "ts",
			})
		).not.toThrow();
		expect(() =>
			deriveCorrelatedArgs({
				ts: true,
				lang: "ts",
			})
		).toThrow(
			"The `--ts` argument cannot be specified in conjunction with the `--lang` argument"
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

	test('should update the "name" field in package.json', ({ expect }) => {
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
			expect.objectContaining({ name: "my-project" })
		);
	});

	test("it should update pyproject.toml if it exists", ({ expect }) => {
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
			expect.objectContaining({ name: "my-project" })
		);

		expect(writeFileMock).toHaveBeenCalledWith(
			expect.stringContaining("pyproject.toml"),
			expect.stringContaining(`name = "my-project"`)
		);
	});
});

describe("writeAgentsMd", () => {
	let writeFileMock: Mock;

	beforeEach(() => {
		vi.resetAllMocks();
		writeFileMock = vi.mocked(writeFile);
	});

	test("should write AGENTS.md to the project directory", ({ expect }) => {
		vi.mocked(existsSync).mockReturnValue(false);
		const projectPath = join("/path/to/my-project");
		writeAgentsMd(projectPath);

		expect(writeFileMock).toHaveBeenCalledWith(
			join(projectPath, "AGENTS.md"),
			getAgentsMd()
		);
	});

	test("should not overwrite existing AGENTS.md", ({ expect }) => {
		vi.mocked(existsSync).mockReturnValue(true);
		const projectPath = join("/path/to/my-project");
		writeAgentsMd(projectPath);

		expect(writeFileMock).not.toHaveBeenCalled();
	});
});
