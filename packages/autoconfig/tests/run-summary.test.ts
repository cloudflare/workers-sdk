import { NpmPackageManager } from "@cloudflare/workers-utils";
import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { dedent } from "ts-dedent";
import { describe, test } from "vitest";
import { Astro } from "../src/frameworks/astro";
import { Static } from "../src/frameworks/static";
import { buildOperationsSummary } from "../src/run";
import { createMockContext } from "./helpers/mock-context";
import type { WorkerConfigInput } from "@cloudflare/config";

const testWorkerConfig: WorkerConfigInput = {
	name: "worker-name",
	compatibilityDate: "2026-08-04",
	observability: {
		enabled: true,
	},
};

describe("autoconfig run - buildOperationsSummary()", () => {
	const std = mockConsoleMethods();
	const context = createMockContext();

	describe("interactive mode", () => {
		test("presents a summary for a simple project where only a wrangler.jsonc file needs to be created", async ({
			expect,
		}) => {
			const summary = await buildOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					configured: false,
					outputDir: "public",
					framework: new Static({ id: "static", name: "Static" }),
					packageManager: NpmPackageManager,
				},
				testWorkerConfig,
				{ workerConfig: testWorkerConfig },
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
					version: "npx wrangler versions upload",
				},
				false,
				"wrangler",
				context
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				📄 Create wrangler.jsonc:
				  {
				    "$schema": "node_modules/wrangler/config-schema.json",
				    "name": "worker-name",
				    "compatibility_date": "2026-08-04",
				    "observability": {
				      "enabled": true
				    }
				  }
				"
			`);

			expect(summary).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run build",
				  "deployCommand": "npx wrangler deploy",
				  "frameworkId": "static",
				  "outputDir": "public",
				  "scripts": {},
				  "versionCommand": "npx wrangler versions upload",
				  "wranglerConfig": {
				    "$schema": "node_modules/wrangler/config-schema.json",
				    "compatibility_date": "2026-08-04",
				    "name": "worker-name",
				    "observability": {
				      "enabled": true,
				    },
				  },
				}
			`);
		});

		test("shows that wrangler will be added as a devDependency when not already installed as such", async ({
			expect,
		}) => {
			const summary = await buildOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					packageJson: {
						name: "my-project",
						devDependencies: {},
					},
					configured: false,
					outputDir: "dist",
					framework: new Static({ id: "static", name: "Static" }),
					packageManager: NpmPackageManager,
				},
				testWorkerConfig,
				{ workerConfig: testWorkerConfig },
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
					version: "npx wrangler versions upload",
				},
				true,
				"wrangler",
				context
			);

			expect(std.out).toContain(
				dedent`
				📦 Install packages:
				 - wrangler (devDependency)
				`
			);

			expect(summary).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run build",
				  "deployCommand": "npx wrangler deploy",
				  "frameworkId": "static",
				  "outputDir": "dist",
				  "scripts": {
				    "deploy": "wrangler deploy",
				    "preview": "wrangler dev",
				  },
				  "versionCommand": "npx wrangler versions upload",
				  "wranglerConfig": {
				    "$schema": "node_modules/wrangler/config-schema.json",
				    "compatibility_date": "2026-08-04",
				    "name": "worker-name",
				    "observability": {
				      "enabled": true,
				    },
				  },
				}
			`);
		});

		test("when a package.json is present wrangler@latest will be unconditionally installed (even if already present)", async ({
			expect,
		}) => {
			const summary = await buildOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					packageJson: {
						name: "my-project",
						devDependencies: {
							wrangler: "^4.0.0",
						},
					},
					configured: false,
					outputDir: "out",
					framework: new Static({ id: "static", name: "Static" }),
					packageManager: NpmPackageManager,
				},
				testWorkerConfig,
				{ workerConfig: testWorkerConfig },
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
					version: "npx wrangler versions upload",
				},
				true,
				"wrangler",
				context
			);

			expect(std.out).toContain(
				dedent`
				📦 Install packages:
				 - wrangler (devDependency)
				`
			);

			expect(summary).toMatchInlineSnapshot(`
				{
				  "buildCommand": "npm run build",
				  "deployCommand": "npx wrangler deploy",
				  "frameworkId": "static",
				  "outputDir": "out",
				  "scripts": {
				    "deploy": "wrangler deploy",
				    "preview": "wrangler dev",
				  },
				  "versionCommand": "npx wrangler versions upload",
				  "wranglerConfig": {
				    "$schema": "node_modules/wrangler/config-schema.json",
				    "compatibility_date": "2026-08-04",
				    "name": "worker-name",
				    "observability": {
				      "enabled": true,
				    },
				  },
				}
			`);
		});

		test("uses cf scripts and previews package installation and generated config files", async ({
			expect,
		}) => {
			const buildConfig = { assetsDirectory: "dist" };
			const summary = await buildOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					packageJson: { name: "my-project" },
					configured: false,
					outputDir: "dist",
					buildCommand: "npm run build",
					framework: new Static({ id: "static", name: "Static" }),
					packageManager: NpmPackageManager,
				},
				testWorkerConfig,
				{
					buildTool: "wrangler",
					workerConfig: testWorkerConfig,
					buildConfig,
				},
				{
					build: "npm run build",
					deploy: "cf deploy",
				},
				true,
				"cf",
				context,
				{
					deploy: "wrangler deploy",
					preview: "wrangler dev",
				}
			);

			expect(summary.scripts).toEqual({
				deploy: "npm run build && cf deploy --no-build",
				preview: "cf dev",
			});
			expect(std.out).toContain(
				dedent`
				📦 Install packages:
				 - cf (devDependency)
				 - wrangler (devDependency)
				`
			);
			expect(std.out).toContain('  import { defineWorker } from "cf/config";');
			expect(std.out).toContain("  export default defineWorker({");
			expect(std.out).toContain(
				'  import { defineWranglerConfig } from "wrangler/experimental-config";'
			);
			expect(std.out).toContain("  export default defineWranglerConfig({");
		});

		test("shows that when needed a framework specific configuration will be run", async ({
			expect,
		}) => {
			const summary = await buildOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					framework: new Astro({ id: "astro", name: "Astro" }),
					configured: false,
					outputDir: "dist",
					packageManager: NpmPackageManager,
				},
				testWorkerConfig,
				{ workerConfig: testWorkerConfig },
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
				},
				false,
				"wrangler",
				context
			);

			expect(std.out).toContain(
				'🛠️  Configuring project for Astro with "astro add cloudflare"'
			);

			expect(summary.frameworkConfiguration).toBe(
				'Configuring project for Astro with "astro add cloudflare"'
			);

			expect(summary.frameworkId).toBe("astro");
		});

		test("doesn't show the framework specific configuration step for the Static framework", async ({
			expect,
		}) => {
			const summary = await buildOperationsSummary(
				{
					workerName: "worker-name",
					projectPath: "<PROJECT_PATH>",
					framework: new Static({ id: "static", name: "Static" }),
					configured: false,
					outputDir: "public",
					packageManager: NpmPackageManager,
				},
				testWorkerConfig,
				{ workerConfig: testWorkerConfig },
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
				},
				false,
				"wrangler",
				context
			);

			expect(std.out).not.toContain("🛠️  Configuring project for");
			expect(summary.frameworkConfiguration).toBeUndefined();
		});
	});
});
