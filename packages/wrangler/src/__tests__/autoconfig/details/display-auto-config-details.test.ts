import { describe, expect, it, vi } from "vitest";
import { displayAutoConfigDetails } from "../../../autoconfig/details";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { Framework } from "../../../autoconfig/frameworks";

vi.mock("../../../package-manager", () => ({
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

describe("autoconfig details - displayAutoConfigDetails()", () => {
	const std = mockConsoleMethods();

	it("should cleanly handle a case in which only the worker name has been detected", () => {
		displayAutoConfigDetails({
			configured: false,
			projectPath: process.cwd(),
			workerName: "my-project",
		});
		expect(std.out).toMatchInlineSnapshot(
			`
			"
			Detected Project Settings:
			 - Worker Name: my-project
			"
		`
		);
	});

	it("should display all the project settings provided by the details object", () => {
		displayAutoConfigDetails({
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
				autoConfigSupported: true,
			},
			buildCommand: "astro build",
			outputDir: "dist",
		});
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

	it("should omit the framework entry when they it is not part of the details object", () => {
		displayAutoConfigDetails({
			configured: false,
			projectPath: process.cwd(),
			workerName: "my-app",
			buildCommand: "npm run build",
			outputDir: "dist",
		});
		expect(std.out).toMatchInlineSnapshot(`
			"
			Detected Project Settings:
			 - Worker Name: my-app
			 - Build Command: npm run build
			 - Output Directory: dist
			"
		`);
	});

	it("should omit the framework and build command entries when they are not part of the details object", () => {
		displayAutoConfigDetails({
			configured: false,
			projectPath: process.cwd(),
			workerName: "my-site",
			outputDir: "dist",
		});
		expect(std.out).toMatchInlineSnapshot(`
			"
			Detected Project Settings:
			 - Worker Name: my-site
			 - Output Directory: dist
			"
		`);
	});
});
