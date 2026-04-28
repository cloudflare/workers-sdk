import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { mockPackageManager } from "helpers/__tests__/mocks";
import { describe, test, vi } from "vitest";
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
