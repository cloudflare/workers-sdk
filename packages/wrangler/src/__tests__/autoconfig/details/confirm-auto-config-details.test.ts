import { describe, test, vi } from "vitest";
import { confirmAutoConfigDetails } from "../../../autoconfig/details";
import { Astro } from "../../../autoconfig/frameworks/astro";
import { Static } from "../../../autoconfig/frameworks/static";
import {
	mockConfirm,
	mockPrompt,
	mockSelect,
} from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";

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
		test("no modifications applied", async ({ expect }) => {
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
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "./public",
			});

			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run build",
				  "configured": false,
				  "framework": Static {
				    "autoConfigSupported": true,
				    "configurationDescription": undefined,
				    "id": "static",
				    "name": "Static",
				  },
				  "outputDir": "./public",
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "worker-name",
				}
			`);
		});

		test("settings can be updated in a plain static site without a framework nor a build script", async ({
			expect,
		}) => {
			setIsTTY(true);

			mockConfirm({
				text: "Do you want to modify these settings?",
				result: true,
			});
			mockPrompt({
				text: "What do you want to name your Worker?",
				result: "new-name",
			});
			mockSelect({
				text: "What framework is your application using?",
				result: "static",
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
				framework: new Static({ id: "static", name: "Static" }),
			});
			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run app:build",
				  "configured": false,
				  "framework": Static {
				    "autoConfigSupported": true,
				    "configurationDescription": undefined,
				    "id": "static",
				    "name": "Static",
				  },
				  "outputDir": "./_public_",
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "new-name",
				}
			`);
		});

		test("settings can be updated in a static app using a framework", async ({
			expect,
		}) => {
			setIsTTY(true);

			mockConfirm({
				text: "Do you want to modify these settings?",
				result: true,
			});
			mockPrompt({
				text: "What do you want to name your Worker?",
				result: "my-astro-worker",
			});
			mockSelect({
				text: "What framework is your application using?",
				result: "astro",
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
				framework: new Astro({ id: "astro", name: "Astro" }),
				outputDir: "<OUTPUT_DIR>",
				projectPath: "<PROJECT_PATH>",
				configured: false,
			});
			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run build",
				  "configured": false,
				  "framework": Astro {
				    "autoConfigSupported": true,
				    "configurationDescription": "Configuring project for Astro with "astro add cloudflare"",
				    "id": "astro",
				    "name": "Astro",
				  },
				  "outputDir": "",
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "my-astro-worker",
				}
			`);
		});

		test("framework can be changed from a detected framework to another", async ({
			expect,
		}) => {
			setIsTTY(true);

			mockConfirm({
				text: "Do you want to modify these settings?",
				result: true,
			});
			mockPrompt({
				text: "What do you want to name your Worker?",
				result: "my-nuxt-worker",
			});
			mockSelect({
				text: "What framework is your application using?",
				result: "nuxt",
			});
			mockPrompt({
				text: "What directory contains your applications' output/asset files?",
				result: "./dist",
			});
			mockPrompt({
				text: "What is your application's build command?",
				result: "npm run build",
			});

			const updatedAutoConfigDetails = await confirmAutoConfigDetails({
				workerName: "my-astro-site",
				buildCommand: "astro build",
				framework: new Astro({ id: "astro", name: "Astro" }),
				outputDir: "<OUTPUT_DIR>",
				projectPath: "<PROJECT_PATH>",
				configured: false,
			});

			expect(updatedAutoConfigDetails.framework?.id).toBe("nuxt");
			expect(updatedAutoConfigDetails.framework?.name).toBe("Nuxt");
		});
	});

	describe("non-interactive mode", () => {
		test("no modifications are applied in non-interactive", async ({
			expect,
		}) => {
			setIsTTY(false);

			const updatedAutoConfigDetails = await confirmAutoConfigDetails({
				workerName: "worker-name",
				buildCommand: "npm run build",
				projectPath: "<PROJECT_PATH>",
				configured: false,
				framework: new Static({ id: "static", name: "Static" }),
				outputDir: "./public",
			});

			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run build",
				  "configured": false,
				  "framework": Static {
				    "autoConfigSupported": true,
				    "configurationDescription": undefined,
				    "id": "static",
				    "name": "Static",
				  },
				  "outputDir": "./public",
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "worker-name",
				}
			`);
		});
	});
});
