import { existsSync } from "node:fs";
import { join } from "node:path";
import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import degit from "degit";
import { mockSpinner } from "helpers/__tests__/mocks";
import { readFile, readJSON, writeFile, writeJSON } from "helpers/files";
import { beforeEach, describe, test, vi } from "vitest";
import { getAgentsMd } from "../agents-md";
import {
	deriveCorrelatedArgs,
	downloadRemoteTemplate,
	filterTemplatesByLanguage,
	getFrameworkMap,
	getHelloWorldTemplateMap,
	getOtherTemplateMap,
	updatePackageName,
	writeAgentsMd,
} from "../templates";
import type { MultiPlatformTemplateConfig, TemplateConfig } from "../templates";
import type { C3Args, C3Context } from "types";
import type { Mock } from "vitest";

vi.mock("degit");
vi.mock("fs");
vi.mock("helpers/files");
vi.mock("@cloudflare/cli-shared-helpers/interactive");

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

describe("filterTemplatesByLanguage", () => {
	test("should keep every template when no language is specified", ({
		expect,
	}) => {
		const templates = getOtherTemplateMap({});

		expect(
			Object.keys(filterTemplatesByLanguage(templates, undefined))
		).toEqual(Object.keys(templates));
	});

	test("should keep a TypeScript template that has no language variants", ({
		expect,
	}) => {
		// The OpenAPI template ships a single `./ts` directory rather than js/ts
		// variants, so it has no variant key for `--lang ts` to match against.
		const filtered = filterTemplatesByLanguage(getOtherTemplateMap({}), "ts");

		expect(Object.keys(filtered)).toContain("openapi");
	});

	test("should keep TypeScript frameworks that have no language variants", ({
		expect,
	}) => {
		// Most frameworks scaffold the application with their own CLI and only
		// overlay Cloudflare-specific files, so they have no variants either.
		const filtered = Object.keys(
			filterTemplatesByLanguage(getFrameworkMap({}), "ts")
		);

		expect(filtered).toEqual(
			expect.arrayContaining([
				"hono",
				"next",
				"nuxt",
				"react-router",
				"svelte",
				"vike",
			])
		);
	});

	test("should drop TypeScript-only templates when JavaScript is requested", ({
		expect,
	}) => {
		expect(
			Object.keys(filterTemplatesByLanguage(getOtherTemplateMap({}), "js"))
		).not.toContain("openapi");
		expect(
			Object.keys(filterTemplatesByLanguage(getFrameworkMap({}), "js"))
		).not.toContain("react-router");
	});

	test("should drop frameworks whose CLI only writes TypeScript when JavaScript is requested", ({
		expect,
	}) => {
		// `--lang` is not passed to these CLIs, so `--lang js` used to create a
		// TypeScript project, e.g. `--framework qwik --lang js` ran
		// `create-qwik playground` and got its TypeScript playground.
		const frameworks = Object.keys(
			filterTemplatesByLanguage(getFrameworkMap({}), "js")
		);

		for (const typescriptOnly of [
			"analog",
			"angular",
			"hono",
			"next",
			"nuxt",
			"qwik",
			"redwood",
			"tanstack-start",
			"vike",
			"waku",
		]) {
			expect(frameworks).not.toContain(typescriptOnly);
		}
	});

	test("should keep frameworks whose own CLI lets the user pick JavaScript", ({
		expect,
	}) => {
		const frameworks = Object.keys(
			filterTemplatesByLanguage(getFrameworkMap({}), "js")
		);

		expect(frameworks).toEqual(
			expect.arrayContaining(["docusaurus", "gatsby", "solid", "svelte", "vue"])
		);
		expect(
			Object.keys(
				filterTemplatesByLanguage(getFrameworkMap({ experimental: true }), "js")
			)
		).toContain("next");
	});

	test("should declare the languages of every template that ships a single set of files", ({
		expect,
	}) => {
		// Nothing is assumed for a template that does not declare them, so one
		// missing here would be hidden from every `--lang`.
		const undeclared: string[] = [];

		for (const experimental of [false, true]) {
			const maps: Record<
				string,
				TemplateConfig | MultiPlatformTemplateConfig
			>[] = [
				getFrameworkMap({ experimental }),
				getHelloWorldTemplateMap({ experimental }),
				getOtherTemplateMap({ experimental }),
			];

			for (const map of maps) {
				for (const [name, config] of Object.entries(map)) {
					const leaves: [string, TemplateConfig][] =
						"platformVariants" in config
							? [
									[`${name}:pages`, config.platformVariants.pages],
									[`${name}:workers`, config.platformVariants.workers],
								]
							: [[name, config]];

					for (const [leafName, leaf] of leaves) {
						const hasVariants =
							leaf.copyFiles !== undefined && "variants" in leaf.copyFiles;
						if (!hasVariants && !leaf.languages?.length) {
							undeclared.push(leafName);
						}
					}
				}
			}
		}

		expect(undeclared).toEqual([]);
	});

	test("should drop templates that cannot be created in Python", ({
		expect,
	}) => {
		// The Application Starter templates are all JavaScript or TypeScript, so
		// `--lang python` leaves that category empty and C3 reports it as such.
		expect(
			Object.keys(filterTemplatesByLanguage(getOtherTemplateMap({}), "python"))
		).toEqual([]);

		const frameworks = Object.keys(
			filterTemplatesByLanguage(getFrameworkMap({}), "python")
		);

		expect(frameworks).not.toContain("hono");
		expect(frameworks).not.toContain("next");
		expect(frameworks).not.toContain("react-router");
	});

	test("should keep the templates that declare a Python variant", ({
		expect,
	}) => {
		const filtered = Object.keys(
			filterTemplatesByLanguage(getHelloWorldTemplateMap({}), "python")
		);

		expect(filtered).toEqual(
			expect.arrayContaining([
				"hello-world",
				"hello-world-with-assets",
				"hello-world-durable-object",
				"hello-world-durable-object-with-assets",
			])
		);
		expect(filtered).not.toContain("hello-world-workflows");
		expect(filtered).not.toContain("common");
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
