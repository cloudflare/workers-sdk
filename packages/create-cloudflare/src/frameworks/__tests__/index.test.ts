import { mockPackageManager } from "helpers/__tests__/mocks";
import { runCommand } from "helpers/command";
import { describe, expect, test, vi } from "vitest";
import { getFrameworkCli, runFrameworkGenerator } from "..";
import { createTestContext } from "../../__tests__/helpers";
import type { PmName } from "helpers/packageManagers";

vi.mock("which-pm-runs");
vi.mock("helpers/command");
vi.mock("@cloudflare/cli");

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
					npm_config_user_agent: "yarn",
				},
			},
			{
				pm: "bun",
				pmCmd: "bunx",
				env: {},
			},
		];

		test.each(cases)("$pm", async ({ pm, pmCmd, env }) => {
			mockPackageManager(pm as PmName);

			await runFrameworkGenerator(ctx, ["-p", "my-project"]);

			expect(vi.mocked(runCommand)).toHaveBeenCalledWith(
				[pmCmd, cli, "-p", "my-project", "--template", "potato"],
				{ env },
			);
		});
	});
});
