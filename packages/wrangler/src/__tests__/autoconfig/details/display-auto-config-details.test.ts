import { describe, it, vi } from "vitest";
import { displayAutoConfigDetails } from "../../../autoconfig/details";
import { Static } from "../../../autoconfig/frameworks/static";
import { NpmPackageManager } from "../../../package-manager";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { Framework } from "../../../autoconfig/frameworks";

vi.mock("../../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

describe("autoconfig details - displayAutoConfigDetails()", () => {
	const std = mockConsoleMethods();

	it("should cleanly handle a case in which only the worker name has been detected", ({
		expect,
	}) => {
		displayAutoConfigDetails({
			configured: false,
			projectPath: process.cwd(),
			workerName: "my-project",
			framework: new Static({ id: "static", name: "Static" }),
			outputDir: "./public",
			packageManager: NpmPackageManager,
		});
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
			packageManager: NpmPackageManager,
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

	it("should omit the framework and build command entries when they are not part of the details object", ({
		expect,
	}) => {
		displayAutoConfigDetails({
			configured: false,
			projectPath: process.cwd(),
			workerName: "my-site",
			outputDir: "dist",
			framework: new Static({ id: "static", name: "Static" }),
			packageManager: NpmPackageManager,
		});
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
