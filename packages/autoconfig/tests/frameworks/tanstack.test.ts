import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { TanstackStart } from "../../src/frameworks/tanstack";
import { createMockContext } from "../helpers/mock-context";

vi.mock("../../src/frameworks/utils/vite-plugin", () => ({
	installCloudflareVitePlugin: vi.fn(),
}));

describe("TanStack Start configuration", () => {
	runInTempDir();

	it.for(["cf", "wrangler"] as const)(
		"configures Vite binding defaults for %s",
		async (target, { expect }) => {
			await writeFile(
				"vite.config.ts",
				`import { defineConfig } from "vite";
export default defineConfig({ plugins: [] });`
			);

			await new TanstackStart({
				id: "tanstack-start",
				name: "TanStack Start",
			}).configure({
				target,
				projectPath: process.cwd(),
				outputDir: "dist",
				workerName: "my-tanstack-app",
				dryRun: false,
				packageManager: NpmPackageManager,
				isWorkspaceRoot: false,
				context: createMockContext(),
			});

			const content = readFileSync("vite.config.ts", "utf8");
			expect(content).toContain('name: "ssr"');
			if (target === "cf") {
				expect(content).toContain("remoteBindings: false");
			} else {
				expect(content).not.toContain("remoteBindings");
			}
		}
	);
});
