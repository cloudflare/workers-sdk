import { NpmPackageManager } from "@cloudflare/workers-utils";
import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { dedent } from "ts-dedent";
import { describe, test } from "vitest";
import { Astro } from "../src/frameworks/astro";
import { Static } from "../src/frameworks/static";
import {
	buildOperationsSummary,
	replacePagesCommandsInScripts,
} from "../src/run";
import { createMockContext } from "./helpers/mock-context";
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
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
					version: "npx wrangler versions upload",
				},
				context
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
					packageManager: NpmPackageManager,
				},
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
					version: "npx wrangler versions upload",
				},
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
					packageManager: NpmPackageManager,
				},
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
					version: "npx wrangler versions upload",
				},
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
					packageManager: NpmPackageManager,
				},
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
				},
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
				testRawConfig,
				{
					build: "npm run build",
					deploy: "npx wrangler deploy",
				},
				context
			);

			expect(std.out).not.toContain("🛠️  Configuring project for");
			expect(summary.frameworkConfiguration).toBeUndefined();
		});
	});
});

describe("replacePagesCommandsInScripts()", () => {
	test("replaces 'wrangler pages dev' with 'wrangler dev'", ({ expect }) => {
		const result = replacePagesCommandsInScripts({
			dev: "wrangler pages dev",
		});
		expect(result).toEqual({ dev: "wrangler dev" });
	});

	test("replaces 'wrangler pages deploy' with 'wrangler deploy'", ({
		expect,
	}) => {
		const result = replacePagesCommandsInScripts({
			deploy: "wrangler pages deploy",
		});
		expect(result).toEqual({ deploy: "wrangler deploy" });
	});

	test("strips the directory positional from pages commands", ({ expect }) => {
		const result = replacePagesCommandsInScripts({
			publish: "wrangler pages deploy public",
			dev: "wrangler pages dev dist",
		});
		expect(result).toEqual({
			publish: "wrangler deploy",
			dev: "wrangler dev",
		});
	});

	test("strips the directory positional but preserves shared flags", ({
		expect,
	}) => {
		const result = replacePagesCommandsInScripts({
			dev: "wrangler pages dev public --port 8789",
			publish: "wrangler pages deploy dist --compatibility-date 2024-01-01",
		});
		expect(result).toEqual({
			dev: "wrangler dev --port 8789",
			publish: "wrangler deploy --compatibility-date 2024-01-01",
		});
	});

	test("strips Pages-only flags and their values", ({ expect }) => {
		const result = replacePagesCommandsInScripts({
			publish: "wrangler pages deploy dist --project-name my-app --branch main",
		});
		expect(result).toEqual({ publish: "wrangler deploy" });
	});

	test("strips the --commit-dirty boolean flag", ({ expect }) => {
		const result = replacePagesCommandsInScripts({
			publish: "wrangler pages deploy dist --commit-dirty",
		});
		expect(result).toEqual({ publish: "wrangler deploy" });
	});

	test("replaces deprecated 'wrangler pages publish' with 'wrangler deploy'", ({
		expect,
	}) => {
		const result = replacePagesCommandsInScripts({
			publish: "wrangler pages publish dist",
		});
		expect(result).toEqual({ publish: "wrangler deploy" });
	});

	test("handles commands chained with '&&'", ({ expect }) => {
		const result = replacePagesCommandsInScripts({
			dev: "npm run build && wrangler pages dev --port 3000",
			publish: "npm run build && wrangler pages deploy dist",
		});
		expect(result).toEqual({
			dev: "npm run build && wrangler dev --port 3000",
			publish: "npm run build && wrangler deploy",
		});
	});

	test("replaces multiple occurrences in a single script", ({ expect }) => {
		const result = replacePagesCommandsInScripts({
			all: "wrangler pages dev & wrangler pages deploy dist",
		});
		expect(result).toEqual({
			all: "wrangler dev & wrangler deploy",
		});
	});

	test("does not modify scripts without pages commands", ({ expect }) => {
		const result = replacePagesCommandsInScripts({
			build: "vite build",
			test: "vitest run",
			dev: "wrangler dev",
			deploy: "wrangler deploy",
		});
		expect(result).toEqual({
			build: "vite build",
			test: "vitest run",
			dev: "wrangler dev",
			deploy: "wrangler deploy",
		});
	});

	test("leaves non-string values untouched", ({ expect }) => {
		const scripts: Record<string, unknown> = {
			dev: "wrangler pages dev",
			config: { nested: true },
			count: 42,
		};
		const result = replacePagesCommandsInScripts(scripts);
		expect(result).toEqual({
			dev: "wrangler dev",
			config: { nested: true },
			count: 42,
		});
	});

	test("handles an empty scripts object", ({ expect }) => {
		const result = replacePagesCommandsInScripts({});
		expect(result).toEqual({});
	});

	test("preserves flags that appear before the directory positional", ({
		expect,
	}) => {
		const result = replacePagesCommandsInScripts({
			dev: "wrangler pages dev --port 3000 public",
		});
		expect(result).toEqual({ dev: "wrangler dev --port 3000" });
	});

	test("strips Pages-only flags written in --flag=value form", ({ expect }) => {
		const result = replacePagesCommandsInScripts({
			publish: "wrangler pages deploy dist --project-name=my-app --branch=main",
		});
		expect(result).toEqual({ publish: "wrangler deploy" });
	});

	test("keeps everything after a bare -- separator verbatim", ({ expect }) => {
		const result = replacePagesCommandsInScripts({
			dev: "wrangler pages dev -- npm run dev",
		});
		expect(result).toEqual({ dev: "wrangler dev -- npm run dev" });
	});

	test("strips positional and Pages flags before -- while keeping the rest", ({
		expect,
	}) => {
		const result = replacePagesCommandsInScripts({
			dev: "wrangler pages dev public --project-name my-app -- npm run start",
		});
		expect(result).toEqual({ dev: "wrangler dev -- npm run start" });
	});
});
