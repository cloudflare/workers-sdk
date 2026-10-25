import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { mockPackageManager } from "helpers/__tests__/mocks";
import astro from "templates/astro/c3";
import nuxt from "templates/nuxt/c3";
import { afterEach, describe, test, vi } from "vitest";
import { getFrameworkCli, runFrameworkGenerator } from "..";
import { createTestContext } from "../../__tests__/helpers";

vi.mock("which-pm-runs");
vi.mock("@cloudflare/cli-shared-helpers/command");
vi.mock("@cloudflare/cli-shared-helpers");

describe("frameworks", () => {
	const ctx = createTestContext();
	ctx.template.id = "solid";
	ctx.args.additionalArgs = ["--template", "potato"];
	const cli = getFrameworkCli(ctx, true);

	describe("runFrameworkGenerator", () => {
		const cases = [
			{
				pm: "npm",
				pmCmd: "npx",
				env: {},
			},
			{
				pm: "pnpm",
				pmCmd: "pnpx",
				env: {},
			},
			{
				pm: "yarn",
				pmCmd: "npx",
				env: {
					npm_config_user_agent: "yarn/1.22.22",
				},
			},
			{
				pm: "bun",
				pmCmd: "bunx",
				env: {},
			},
		];

		test.for(cases)("$pm", async ({ pm, pmCmd, env }, { expect }) => {
			mockPackageManager(pm);

			await runFrameworkGenerator(ctx, ["-p", "my-project"]);

			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				[pmCmd, cli, "-p", "my-project", "--template", "potato"],
				{ env }
			);
		});
	});
});

describe("framework CLI Node.js requirements", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe.each(Object.entries(astro.platformVariants))(
		"Astro (%s)",
		(_, template) => {
			test.for(["22.0.0", "22.22.0", "22.23.1", "22.23.3"])(
				"rejects Node.js %s before running create-astro",
				async (nodeVersion, { expect }) => {
					vi.stubGlobal("process", {
						...process,
						versions: { ...process.versions, node: nodeVersion },
					});
					const ctx = createTestContext();
					ctx.template = template;

					await expect(
						runFrameworkGenerator(ctx, [ctx.project.name])
					).rejects.toThrow(
						`Astro requires Node.js >=22.23.4. You are using Node.js ${nodeVersion}. Please upgrade Node.js and try again.`
					);
					expect(runCommand).not.toHaveBeenCalled();
				}
			);

			test.for(["22.23.4", "22.24.0", "24.0.0", "26.0.0"])(
				"runs create-astro on Node.js %s",
				async (nodeVersion, { expect }) => {
					vi.stubGlobal("process", {
						...process,
						versions: { ...process.versions, node: nodeVersion },
					});
					mockPackageManager("pnpm");
					const ctx = createTestContext();
					ctx.template = template;

					await runFrameworkGenerator(ctx, [ctx.project.name]);

					expect(runCommand).toHaveBeenCalledWith(
						["pnpx", getFrameworkCli(ctx), ctx.project.name],
						{ env: {} }
					);
				}
			);
		}
	);

	describe.each(Object.entries(nuxt.platformVariants))(
		"Nuxt (%s)",
		(_, template) => {
			test.for([
				"22.0.0",
				"22.20.0",
				"22.20.99",
				"23.0.0",
				"24.0.0",
				"24.10.99",
				"25.0.0",
			])(
				"rejects Node.js %s before running nuxi",
				async (nodeVersion, { expect }) => {
					vi.stubGlobal("process", {
						...process,
						versions: { ...process.versions, node: nodeVersion },
					});
					const ctx = createTestContext();
					ctx.template = template;

					await expect(
						runFrameworkGenerator(ctx, ["init", ctx.project.name])
					).rejects.toThrow(
						`Nuxt requires Node.js ^22.21.0 || ^24.11.0 || >=26.0.0. You are using Node.js ${nodeVersion}. Please upgrade Node.js and try again.`
					);
					expect(runCommand).not.toHaveBeenCalled();
				}
			);

			test.for([
				"22.21.0",
				"22.22.1",
				"24.11.0",
				"24.20.0",
				"26.0.0",
				"27.0.0",
			])("runs nuxi on Node.js %s", async (nodeVersion, { expect }) => {
				vi.stubGlobal("process", {
					...process,
					versions: { ...process.versions, node: nodeVersion },
				});
				mockPackageManager("pnpm");
				const ctx = createTestContext();
				ctx.template = template;

				await runFrameworkGenerator(ctx, ["init", ctx.project.name]);

				expect(runCommand).toHaveBeenCalledWith(
					["pnpx", getFrameworkCli(ctx), "init", ctx.project.name],
					{ env: {} }
				);
			});
		}
	);

	test("runs other framework CLIs on C3-supported Node.js versions", async ({
		expect,
	}) => {
		vi.stubGlobal("process", {
			...process,
			versions: { ...process.versions, node: "22.0.0" },
		});
		mockPackageManager("pnpm");
		const ctx = createTestContext();
		ctx.template.frameworkCli = "create-solid";

		await runFrameworkGenerator(ctx, ["-p", ctx.project.name]);

		expect(runCommand).toHaveBeenCalledWith(
			["pnpx", getFrameworkCli(ctx), "-p", ctx.project.name],
			{ env: {} }
		);
	});
});

describe("Nuxt Node.js version pin", () => {
	runInTempDir();

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test.for(Object.entries(nuxt.platformVariants))(
		"writes a supported .node-version inside the %s project",
		async ([platform, template], { expect }) => {
			vi.stubGlobal("process", {
				...process,
				versions: { ...process.versions, node: "22.23.1" },
			});
			const ctx = createTestContext(`nuxt-${platform}`);
			ctx.project.path = resolve(ctx.project.path);
			ctx.template = template;
			mockPackageManager("pnpm");
			vi.mocked(runCommand).mockImplementationOnce(async () => {
				mkdirSync(ctx.project.path);
				return "";
			});

			await template.generate?.(ctx);

			expect(
				readFileSync(join(ctx.project.path, ".node-version"), "utf-8")
			).toBe("22.23.1");
			expect(existsSync(".node-version")).toBe(false);
		}
	);
});
