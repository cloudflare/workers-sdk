import { NpmPackageManager } from "@cloudflare/workers-utils";
import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { displayAutoConfigDetails } from "../../src/details";
import { Static } from "../../src/frameworks/static";
import { createMockContext } from "../helpers/mock-context";
import type { Framework } from "../../src/frameworks";

describe("autoconfig details - displayAutoConfigDetails()", () => {
	const std = mockConsoleMethods();
	const context = createMockContext();

	it("should cleanly handle a case in which only the worker name has been detected", ({
		expect,
	}) => {
		displayAutoConfigDetails(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-project",
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "./public",
				packageManager: NpmPackageManager,
			},
			context
		);
		expect(std.out).toMatchInlineSnapshot(
			`
			"
			Detected Project Settings:
			 - Worker Name: my-project
			 - Framework: Static
			 - Output Directory: ./public
			"
		`
		);
	});

	it("should display all the project settings provided by the details object", ({
		expect,
	}) => {
		displayAutoConfigDetails(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-astro-app",
				framework: {
					name: "Astro",
					id: "astro",
					isConfigured: () => false,
					configure: () =>
						({
							wranglerConfig: {},
						}) satisfies ReturnType<Framework["configure"]>,
				} as unknown as Framework,
				buildCommand: "astro build",
				outputDir: "dist",
				packageManager: NpmPackageManager,
			},
			context
		);
		expect(std.out).toMatchInlineSnapshot(`
			"
			Detected Project Settings:
			 - Worker Name: my-astro-app
			 - Framework: Astro
			 - Build Command: astro build
			 - Output Directory: dist
			"
		`);
	});

	it("should omit the framework and build command entries when they are not part of the details object", ({
		expect,
	}) => {
		displayAutoConfigDetails(
			{
				configured: false,
				projectPath: process.cwd(),
				workerName: "my-site",
				outputDir: "dist",
				framework: new Static({ id: "static", name: "Static" }),
				packageManager: NpmPackageManager,
			},
			context
		);
		expect(std.out).toMatchInlineSnapshot(`
			"
			Detected Project Settings:
			 - Worker Name: my-site
			 - Framework: Static
			 - Output Directory: dist
			"
		`);
	});
});
