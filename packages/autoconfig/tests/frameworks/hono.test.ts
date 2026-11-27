import { NpmPackageManager } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { Hono } from "../../src/frameworks/hono";
import { createMockContext } from "../helpers/mock-context";

const options = {
	target: "cf" as const,
	projectPath: process.cwd(),
	outputDir: "dist",
	workerName: "my-hono-app",
	dryRun: false,
	packageManager: NpmPackageManager,
	isWorkspaceRoot: false,
	context: createMockContext(),
};

describe("Hono", () => {
	it("leaves a project that deploys with Wrangler as it is", ({ expect }) => {
		const framework = new Hono({ id: "hono", name: "Hono" });

		expect(
			framework.configure({
				...options,
				wranglerConfig: { main: "./src/index.ts" },
			})
		).toEqual({ workerConfig: {} });
	});

	it("refuses a project without a Wrangler config", ({ expect }) => {
		const framework = new Hono({ id: "hono", name: "Hono" });

		expect(() => framework.configure(options)).toThrow(
			"cf can only set up Hono projects that already deploy with a Wrangler configuration file."
		);
	});
});
