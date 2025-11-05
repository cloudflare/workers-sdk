import { describe, expect, it } from "vitest";
import { displayAutoConfigDetails } from "../../autoconfig/get-details";
import { mockConsoleMethods } from "../helpers/mock-console";

describe("autoconfig details", () => {
	// TODO(dario): move the "getDetailsForAutoConfig()" tests in autoconfig.test.ts here

	describe("displayAutoConfigDetails()", () => {
		const std = mockConsoleMethods();

		it("should cleanly handle a case in which no settings have been detected", () => {
			displayAutoConfigDetails({
				configured: false,
			});
			expect(std.out).toMatchInlineSnapshot(
				`"No Project Settings Auto-detected"`
			);
		});

		it("should display all the project settings provided by the details object", () => {
			displayAutoConfigDetails({
				configured: false,
				framework: { name: "Astro", configured: false, configure: () => ({}) },
				buildCommand: "astro build",
				outputDir: "dist",
			});
			expect(std.out).toMatchInlineSnapshot(`
				"Auto-detected Project Settings:
				 - Framework: Astro
				 - Build Command: astro build
				 - Output Directory: dist
				"
			`);
		});

		it("should omit the framework entry when they it is not part of the details object", () => {
			displayAutoConfigDetails({
				configured: false,
				buildCommand: "npm run build",
				outputDir: "dist",
			});
			expect(std.out).toMatchInlineSnapshot(`
				"Auto-detected Project Settings:
				 - Build Command: npm run build
				 - Output Directory: dist
				"
			`);
		});

		it("should omit the framework and build command entries when they are not part of the details object", () => {
			displayAutoConfigDetails({
				configured: false,
				outputDir: "dist",
			});
			expect(std.out).toMatchInlineSnapshot(`
				"Auto-detected Project Settings:
				 - Output Directory: dist
				"
			`);
		});
	});
});
