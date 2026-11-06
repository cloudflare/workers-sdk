import { readFileSync } from "node:fs";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { Static } from "../src/frameworks/static";
import { runAutoConfig } from "../src/run";
import { createMockContext } from "./helpers/mock-context";

describe("runAutoConfig() - existing project scripts", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("does not overwrite an existing deploy script", async ({ expect }) => {
		vi.spyOn(cliPackages, "installPackages").mockResolvedValue();
		vi.spyOn(cliPackages, "installWrangler").mockResolvedValue();
		const packageJson = {
			name: "my-static-app",
			scripts: {
				deploy: "astro build && wrangler deploy",
			},
		};
		await seed({
			"package.json": JSON.stringify(packageJson),
			"public/index.html": "<h1>Hello World</h1>",
		});

		await runAutoConfig(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-static-app",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "public",
				packageJson,
				packageManager: NpmPackageManager,
			},
			{
				target: "cf",
				context: createMockContext(),
				skipConfirmations: true,
				runBuild: false,
				enableTargetCliInstallation: false,
			}
		);

		expect(JSON.parse(readFileSync("package.json", "utf8"))).toMatchObject({
			scripts: {
				deploy: "astro build && wrangler deploy",
			},
		});
	});
});
