import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import { NextJs } from "../../src/frameworks/next";
import { createMockContext } from "../helpers/mock-context";

vi.mock("@cloudflare/cli-shared-helpers/command");

const context = createMockContext();
const BASE_OPTIONS = {
	projectPath: "/next-app",
	workerName: "next-app",
	outputDir: "dist/",
	dryRun: false,
	packageManager: NpmPackageManager,
	isWorkspaceRoot: false,
	context,
};

describe("Next.js framework configure()", () => {
	beforeEach(() => {
		vi.mocked(runCommand).mockReset();
	});

	it("configures Cloudflare deployment with vinext", async ({ expect }) => {
		const framework = new NextJs({ id: "next", name: "Next.js" });

		const result = await framework.configure(BASE_OPTIONS);

		expect(runCommand).toHaveBeenCalledWith(
			[
				"npx",
				"vinext",
				"init",
				"--platform=cloudflare",
				"--cdn-cache=workers-cache",
				"--data-cache=none",
				"--image-optimization=cloudflare-images",
				"--no-prerender",
				"--no-experimental-warm-cdn-cache",
			],
			{ cwd: "/next-app" }
		);
		expect(result).toEqual({
			wranglerConfig: null,
			packageJsonScriptsOverrides: {
				preview:
					"vinext build && wrangler dev --config dist/server/wrangler.json",
				deploy: "vinext-cloudflare deploy --config dist/server/wrangler.json",
			},
			buildCommandOverride: "npx vinext build",
			deployCommandOverride: "npx vinext-cloudflare deploy",
			versionCommandOverride:
				"npx wrangler versions upload --config dist/server/wrangler.json",
		});
		expect(framework.configurationDescription).toBe(
			"Configuring project for Next.js with vinext by running `vinext init`"
		);
	});

	it("does not run vinext init during a dry run", async ({ expect }) => {
		const framework = new NextJs({ id: "next", name: "Next.js" });

		await framework.configure({ ...BASE_OPTIONS, dryRun: true });

		expect(runCommand).not.toHaveBeenCalled();
	});
});
