import { NpmPackageManager } from "@cloudflare/workers-utils";
import { describe, test, vi } from "vitest";
import { confirmAutoConfigDetails } from "../../src/details";
import { Astro } from "../../src/frameworks/astro";
import { Static } from "../../src/frameworks/static";
import { createMockContext } from "../helpers/mock-context";

describe("autoconfig details - confirmAutoConfigDetails()", () => {
	describe("interactive mode", () => {
		test("no modifications applied", async ({ expect }) => {
			const noModifyContext = createMockContext({
				dialogs: {
					confirm: vi.fn().mockResolvedValue(false),
					prompt: vi.fn().mockResolvedValue(""),
					select: vi.fn().mockResolvedValue(""),
				},
			});
			const updatedAutoConfigDetails = await confirmAutoConfigDetails(
				{
					workerName: "worker-name",
					buildCommand: "npm run build",
					projectPath: "<PROJECT_PATH>",
					configured: false,
					framework: new Static({ id: "static", name: "Static" }),
					outputDir: "./public",
					packageManager: NpmPackageManager,
				},
				noModifyContext
			);

			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run build",
				  "configured": false,
				  "framework": Static {
				    "configurationDescription": undefined,
				    "id": "static",
				    "name": "Static",
				  },
				  "outputDir": "./public",
				  "packageManager": {
				    "dlx": [
				      "npx",
				    ],
				    "lockFiles": [
				      "package-lock.json",
				    ],
				    "npx": "npx",
				    "type": "npm",
				  },
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "worker-name",
				}
			`);
		});

		test("settings can be updated in a plain static site without a framework nor a build script", async ({
			expect,
		}) => {
			const modifyContext = createMockContext({
				dialogs: {
					confirm: vi.fn().mockResolvedValue(true),
					prompt: vi
						.fn()
						.mockResolvedValueOnce("new-name")
						.mockResolvedValueOnce("./_public_")
						.mockResolvedValueOnce("npm run app:build"),
					select: vi.fn().mockResolvedValue("static"),
				},
			});

			const updatedAutoConfigDetails = await confirmAutoConfigDetails(
				{
					workerName: "my-worker",
					buildCommand: "npm run build",
					outputDir: "<OUTPUT_DIR>",
					projectPath: "<PROJECT_PATH>",
					configured: false,
					framework: new Static({ id: "static", name: "Static" }),
					packageManager: NpmPackageManager,
				},
				modifyContext
			);
			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run app:build",
				  "configured": false,
				  "framework": Static {
				    "configurationDescription": undefined,
				    "id": "static",
				    "name": "Static",
				  },
				  "outputDir": "./_public_",
				  "packageManager": {
				    "dlx": [
				      "npx",
				    ],
				    "lockFiles": [
				      "package-lock.json",
				    ],
				    "npx": "npx",
				    "type": "npm",
				  },
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "new-name",
				}
			`);
		});

		test("settings can be updated in a static app using a framework", async ({
			expect,
		}) => {
			const modifyContext = createMockContext({
				dialogs: {
					confirm: vi.fn().mockResolvedValue(true),
					prompt: vi
						.fn()
						.mockResolvedValueOnce("my-astro-worker")
						.mockResolvedValueOnce("")
						.mockResolvedValueOnce("npm run build"),
					select: vi.fn().mockResolvedValue("astro"),
				},
			});

			const updatedAutoConfigDetails = await confirmAutoConfigDetails(
				{
					workerName: "my-astro-site",
					buildCommand: "astro build",
					framework: new Astro({ id: "astro", name: "Astro" }),
					outputDir: "<OUTPUT_DIR>",
					projectPath: "<PROJECT_PATH>",
					configured: false,
					packageManager: NpmPackageManager,
				},
				modifyContext
			);
			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run build",
				  "configured": false,
				  "framework": Astro {
				    "configurationDescription": "Configuring project for Astro with "astro add cloudflare"",
				    "id": "astro",
				    "name": "Astro",
				  },
				  "outputDir": "",
				  "packageManager": {
				    "dlx": [
				      "npx",
				    ],
				    "lockFiles": [
				      "package-lock.json",
				    ],
				    "npx": "npx",
				    "type": "npm",
				  },
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "my-astro-worker",
				}
			`);
		});

		test("framework can be changed from a detected framework to another", async ({
			expect,
		}) => {
			const modifyContext = createMockContext({
				dialogs: {
					confirm: vi.fn().mockResolvedValue(true),
					prompt: vi
						.fn()
						.mockResolvedValueOnce("my-nuxt-worker")
						.mockResolvedValueOnce("./dist")
						.mockResolvedValueOnce("npm run build"),
					select: vi.fn().mockResolvedValue("nuxt"),
				},
			});

			const updatedAutoConfigDetails = await confirmAutoConfigDetails(
				{
					workerName: "my-astro-site",
					buildCommand: "astro build",
					framework: new Astro({ id: "astro", name: "Astro" }),
					outputDir: "<OUTPUT_DIR>",
					projectPath: "<PROJECT_PATH>",
					configured: false,
					packageManager: NpmPackageManager,
				},
				modifyContext
			);

			expect(updatedAutoConfigDetails.framework?.id).toBe("nuxt");
			expect(updatedAutoConfigDetails.framework?.name).toBe("Nuxt");
		});
	});

	describe("non-interactive mode", () => {
		test("no modifications are applied in non-interactive", async ({
			expect,
		}) => {
			const nonInteractiveContext = createMockContext({
				isNonInteractiveOrCI: () => true,
				dialogs: {
					confirm: vi.fn().mockResolvedValue(false),
					prompt: vi.fn().mockResolvedValue(""),
					select: vi.fn().mockResolvedValue(""),
				},
			});

			const updatedAutoConfigDetails = await confirmAutoConfigDetails(
				{
					workerName: "worker-name",
					buildCommand: "npm run build",
					projectPath: "<PROJECT_PATH>",
					configured: false,
					framework: new Static({ id: "static", name: "Static" }),
					outputDir: "./public",
					packageManager: NpmPackageManager,
				},
				nonInteractiveContext
			);

			expect(updatedAutoConfigDetails).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run build",
				  "configured": false,
				  "framework": Static {
				    "configurationDescription": undefined,
				    "id": "static",
				    "name": "Static",
				  },
				  "outputDir": "./public",
				  "packageManager": {
				    "dlx": [
				      "npx",
				    ],
				    "lockFiles": [
				      "package-lock.json",
				    ],
				    "npx": "npx",
				    "type": "npm",
				  },
				  "projectPath": "<PROJECT_PATH>",
				  "workerName": "worker-name",
				}
			`);
		});
	});
});
