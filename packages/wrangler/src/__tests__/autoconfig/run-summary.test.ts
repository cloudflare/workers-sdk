import { beforeEach, describe, test } from "vitest";
import { Astro } from "../../autoconfig/frameworks/astro";
import { Static } from "../../autoconfig/frameworks/static";
import { buildOperationsSummary } from "../../autoconfig/run";
import { dedent } from "../../utils/dedent";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import type { RawConfig } from "@cloudflare/workers-utils";

const testRawConfig: RawConfig = {
	$schema: "node_modules/wrangler/config-schema.json",
	name: "worker-name",
	compatibility_date: "2025-01-01",
	observability: {
		enabled: true,
	},
};

describe("autoconfig run - buildOperationsSummary()", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
	});

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
				},
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
					version: "npx wrangler versions upload",
				}
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				📄 Create wrangler.jsonc:
				  {
				    "$schema": "node_modules/wrangler/config-schema.json",
				    "name": "worker-name",
				    "compatibility_date": "2025-01-01",
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
				    "compatibility_date": "2025-01-01",
				    "name": "worker-name",
				    "observability": {
				      "enabled": true,
				    },
				  },
				  "wranglerInstall": false,
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
				},
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
					version: "npx wrangler versions upload",
				}
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
				    "compatibility_date": "2025-01-01",
				    "name": "worker-name",
				    "observability": {
				      "enabled": true,
				    },
				  },
				  "wranglerInstall": true,
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
				},
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
					version: "npx wrangler versions upload",
				}
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
				    "compatibility_date": "2025-01-01",
				    "name": "worker-name",
				    "observability": {
				      "enabled": true,
				    },
				  },
				  "wranglerInstall": true,
				}
			`);
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
				},
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
				}
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
				},
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
				}
			);

			expect(std.out).not.toContain("🛠️  Configuring project for");
			expect(summary.frameworkConfiguration).toBeUndefined();
		});
	});
});
