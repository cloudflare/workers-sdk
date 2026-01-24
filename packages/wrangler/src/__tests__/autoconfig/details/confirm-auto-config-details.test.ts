import { describe, expect, test, vi } from "vitest";
import { confirmAutoConfigDetails } from "../../../autoconfig/details";
import { mockConfirm, mockPrompt } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import type { Framework } from "../../../autoconfig/frameworks";

vi.mock("../../../package-manager", () => ({
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

describe("autoconfig details - confirmAutoConfigDetails()", () => {
	const { setIsTTY } = useMockIsTTY();

	describe("interactive mode", () => {
		test("no modifications applied", async () => {
			setIsTTY(true);

			mockConfirm({
				text: "Do you want to modify these settings?",
				result: false,
			});
			const updatedAutoConfigDetails = await confirmAutoConfigDetails({
				workerName: "worker-name",
				buildCommand: "npm run build",
				projectPath: "<PROJECT_PATH>",
				configured: false,
			});

			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				Object {
				  "buildCommand": "npm run build",
				  "configured": false,
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "worker-name",
				}
			`);
		});

		test("settings can be updated in a plain static site without a framework nor a build script", async () => {
			setIsTTY(true);

			mockConfirm({
				text: "Do you want to modify these settings?",
				result: true,
			});
			mockPrompt({
				text: "What do you want to name your Worker?",
				result: "new-name",
			});
			mockPrompt({
				text: "What directory contains your applications' output/asset files?",
				result: "./_public_",
			});
			mockPrompt({
				text: "What is your application's build command?",
				result: "npm run app:build",
			});

			const updatedAutoConfigDetails = await confirmAutoConfigDetails({
				workerName: "my-worker",
				buildCommand: "npm run build",
				outputDir: "<OUTPUT_DIR>",
				projectPath: "<PROJECT_PATH>",
				configured: false,
			});
			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				Object {
				  "buildCommand": "npm run app:build",
				  "configured": false,
				  "outputDir": "./_public_",
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "new-name",
				}
			`);
		});

		test("settings can be updated in a static app using a framework", async () => {
			setIsTTY(true);

			mockConfirm({
				text: "Do you want to modify these settings?",
				result: true,
			});
			mockPrompt({
				text: "What do you want to name your Worker?",
				result: "my-astro-worker",
			});
			mockPrompt({
				text: "What directory contains your applications' output/asset files?",
				result: "",
			});
			mockPrompt({
				text: "What is your application's build command?",
				result: "npm run build",
			});

			const updatedAutoConfigDetails = await confirmAutoConfigDetails({
				workerName: "my-astro-site",
				buildCommand: "astro build",
				framework: {
					isConfigured: () => false,
					id: "astro",
					configure: () =>
						({
							wranglerConfig: {},
						}) satisfies ReturnType<Framework["configure"]>,
					name: "astro",
					autoConfigSupported: true,
				},
				outputDir: "<OUTPUT_DIR>",
				projectPath: "<PROJECT_PATH>",
				configured: false,
			});
			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				Object {
				  "buildCommand": "npm run build",
				  "configured": false,
				  "framework": Object {
				    "autoConfigSupported": true,
				    "configure": [Function],
				    "id": "astro",
				    "isConfigured": [Function],
				    "name": "astro",
				  },
				  "outputDir": "",
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "my-astro-worker",
				}
			`);
		});
	});

	describe("non-interactive mode", () => {
		test("no modifications are applied in non-interactive", async () => {
			setIsTTY(false);

			const updatedAutoConfigDetails = await confirmAutoConfigDetails({
				workerName: "worker-name",
				buildCommand: "npm run build",
				projectPath: "<PROJECT_PATH>",
				configured: false,
			});

			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				Object {
				  "buildCommand": "npm run build",
				  "configured": false,
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "worker-name",
				}
			`);
		});
	});
});
