import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as run from "@cloudflare/autoconfig";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import dedent from "ts-dedent";
import { afterEach, assert, describe, test, vi } from "vitest";
import { clearOutputFilePath } from "../output";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";
import type { OutputEntry } from "../output";

vi.mock("../package-manager", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		getPackageManager() {
			return {
				type: "npm",
				npx: "npx",
			};
		},
	};
});

describe("wrangler setup", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	afterEach(() => {
		clearOutputFilePath();
	});

	test("--help", async ({ expect }) => {
		await runWrangler("setup --help");
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler setup

			🪄 Setup a project to work on Cloudflare

			GLOBAL FLAGS
			  -c, --config          Path to Wrangler configuration file  [string]
			      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help            Show help  [boolean]
			      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
			      --profile         Use a specific auth profile  [string]
			  -v, --version         Show version number  [boolean]

			OPTIONS
			  -y, --yes      Answer "yes" to any prompts for configuring your project  [boolean] [default: false]
			      --build    Run your project's build command once it has been configured  [boolean] [default: false]
			      --dry-run  Runs the command without applying any filesystem modifications  [boolean]"
		`);
	});

	test("should skip autoconfig when project is already configured", async ({
		expect,
	}) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({ name: "my-worker" }),
		});

		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runWrangler("setup");

		// autoconfig should _not_ have been run
		expect(runSpy).not.toHaveBeenCalled();

		expect(std.out).toContain(
			"🎉 Your project is already setup to deploy to Cloudflare"
		);
	});

	test("should run autoconfig when project is not configured", async ({
		expect,
	}) => {
		await seed({
			"public/index.html": `<h1>Hello World</h1>`,
			"package.json": JSON.stringify({}),
		});

		// Let's not actually install Wrangler, to speed up tests
		const installSpy = vi
			.spyOn(cliPackages, "installWrangler")
			.mockImplementation(async () => {});

		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runWrangler("setup");

		// autoconfig should have been run
		expect(runSpy).toHaveBeenCalled();

		expect(installSpy).toHaveBeenCalled();

		expect(std.out).toContain(
			"🎉 Your project is now setup to deploy to Cloudflare"
		);
	});

	test("should migrate a Pages Functions project to an editable Worker", async ({
		expect,
	}) => {
		await seed({
			"functions/hello.js":
				'export function onRequest() { return new Response("hello"); }',
			"public/index.html": "<h1>Hello</h1>",
			"package.json": JSON.stringify({ name: "different-package-name" }),
			"wrangler.toml": dedent`
				name = "pages-app"
				pages_build_output_dir = "public"
				compatibility_date = "2025-01-15"
				compatibility_flags = ["global_fetch_strictly_public"]

				[vars]
				EXISTING_VALUE = "preserved"
			`,
		});

		const installWranglerSpy = vi
			.spyOn(cliPackages, "installWrangler")
			.mockImplementation(async () => {});
		const installPackagesSpy = vi
			.spyOn(cliPackages, "installPackages")
			.mockImplementation(async () => {});

		await runWrangler("setup --yes");

		expect(installWranglerSpy).toHaveBeenCalled();
		expect(installPackagesSpy).toHaveBeenCalledWith(
			"npm",
			["@cloudflare/pages-functions"],
			expect.objectContaining({ dev: true })
		);
		expect(existsSync("wrangler.toml")).toBe(false);

		const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
		expect(config).toMatchObject({
			name: "pages-app",
			main: "./worker/index.js",
			compatibility_date: "2025-01-15",
			compatibility_flags: ["global_fetch_strictly_public", "nodejs_compat"],
			vars: { EXISTING_VALUE: "preserved" },
			assets: {
				directory: "public",
				binding: "ASSETS",
				run_worker_first: true,
			},
			build: {
				command: "node ./scripts/build-pages-functions.mjs",
				watch_dir: ["./functions", "./worker"],
			},
		});
		expect(config).not.toHaveProperty("pages_build_output_dir");
		expect(await readFile("worker/index.js", "utf8")).toContain(
			"pagesFunctions.fetch(request, env, ctx)"
		);
		expect(
			await readFile("scripts/build-pages-functions.mjs", "utf8")
		).toContain("buildPagesFunctions");

		const packageJson = JSON.parse(await readFile("package.json", "utf8"));
		expect(packageJson.scripts).toMatchObject({
			deploy: "wrangler deploy",
			preview: "wrangler dev",
		});
	});

	test("should not migrate a Pages config outside the project directory", async ({
		expect,
	}) => {
		const projectRoot = process.cwd();
		await seed({
			"wrangler.toml": dedent`
				name = "pages-app"
				pages_build_output_dir = "child/public"
			`,
			"child/functions/hello.js":
				'export function onRequest() { return new Response("hello"); }',
			"child/public/index.html": "<h1>Hello</h1>",
			"child/package.json": JSON.stringify({ name: "pages-app" }),
		});

		await expect(runWrangler("setup --cwd child --yes")).rejects.toThrow(
			"Wrangler configuration is outside the project directory"
		);
		expect(existsSync(resolve(projectRoot, "wrangler.toml"))).toBe(true);
		expect(existsSync(resolve(projectRoot, "child/wrangler.jsonc"))).toBe(
			false
		);
		expect(existsSync(resolve(projectRoot, "child/worker/index.js"))).toBe(
			false
		);
	});

	test("should create package.json when migrating a package-less Pages project", async ({
		expect,
	}) => {
		await seed({
			"functions/hello.js":
				'export function onRequest() { return new Response("hello"); }',
			"public/index.html": "<h1>Hello</h1>",
			"wrangler.jsonc": JSON.stringify({
				name: "pages-app",
				pages_build_output_dir: "public",
				compatibility_date: "2025-01-15",
			}),
		});
		vi.spyOn(cliPackages, "installWrangler").mockImplementation(async () => {});
		vi.spyOn(cliPackages, "installPackages").mockImplementation(async () => {});

		await runWrangler("setup --yes");

		const packageJson = JSON.parse(await readFile("package.json", "utf8"));
		expect(packageJson).toEqual({
			name: "pages-app",
			private: true,
			type: "module",
			scripts: {
				deploy: "wrangler deploy",
				preview: "wrangler dev",
			},
		});
		expect(std.out).toContain("You can now deploy with npm run deploy");
	});

	test("should not display completion message when disabled", async ({
		expect,
	}) => {
		await seed({
			"public/index.html": `<h1>Hello World</h1>`,
		});

		// Let's not actually install Wrangler, to speed up tests
		vi.spyOn(cliPackages, "installWrangler").mockImplementation(async () => {});

		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runWrangler("setup --no-completion-message");

		// autoconfig should have been run
		expect(runSpy).toHaveBeenCalled();

		expect(std.out).not.toContain("🎉 Your project");
	});

	test("should not install Wrangler when skipped", async ({ expect }) => {
		await seed({
			"public/index.html": `<h1>Hello World</h1>`,
			"package.json": JSON.stringify({}),
		});

		const installSpy = vi
			.spyOn(cliPackages, "installWrangler")
			.mockImplementation(async () => {});

		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runWrangler("setup --no-install-wrangler");

		// autoconfig should have been run
		expect(runSpy).toHaveBeenCalled();

		expect(installSpy).not.toHaveBeenCalled();
	});

	test("should output an autoconfig output entry to WRANGLER_OUTPUT_FILE_PATH", async ({
		expect,
	}) => {
		const outputFile = "./output.json";

		await seed({
			"public/index.html": `<h1>Hello World</h1>`,
			"package.json": JSON.stringify({}),
		});

		await runWrangler("setup --dry-run", {
			...process.env,
			WRANGLER_OUTPUT_FILE_PATH: outputFile,
		});

		const outputEntries = (await readFile(outputFile, "utf8"))
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line)) as OutputEntry[];

		const autoconfigOutputEntry = outputEntries.find(
			(obj) => obj.type === "autoconfig"
		);

		assert(autoconfigOutputEntry);

		if (autoconfigOutputEntry.summary?.wranglerConfig) {
			// Let's normalize the wrangler config values that are
			// randomly generated or change over time
			autoconfigOutputEntry.summary.wranglerConfig.name = "test-name";
			autoconfigOutputEntry.summary.wranglerConfig.compatibility_date =
				"YYYY-MM-DD";
		}

		expect(autoconfigOutputEntry.summary).toMatchInlineSnapshot(`
			{
			  "deployCommand": "npx wrangler deploy",
			  "frameworkId": "static",
			  "outputDir": "public",
			  "scripts": {
			    "deploy": "wrangler deploy",
			    "preview": "wrangler dev",
			  },
			  "versionCommand": "npx wrangler versions upload",
			  "wranglerConfig": {
			    "$schema": "node_modules/wrangler/config-schema.json",
			    "assets": {
			      "directory": "public",
			    },
			    "compatibility_date": "YYYY-MM-DD",
			    "compatibility_flags": [
			      "nodejs_compat",
			    ],
			    "name": "test-name",
			    "observability": {
			      "enabled": true,
			    },
			  },
			  "wranglerInstall": true,
			}
		`);
	});

	describe("--dry-run", () => {
		test("should stop before running autoconfig when project is already configured", async ({
			expect,
		}) => {
			await seed({
				"wrangler.jsonc": JSON.stringify({ name: "my-worker" }),
			});

			const runSpy = vi.spyOn(run, "runAutoConfig");

			await runWrangler("setup --dry-run");

			// autoconfig should _not_ have been run
			expect(runSpy).not.toHaveBeenCalled();

			expect(std.out).toContain(
				"🎉 Your project is already setup to deploy to Cloudflare"
			);
		});

		test("should run autoconfig when project is not configured and stop at the summary step", async ({
			expect,
		}) => {
			await seed({
				"public/index.html": `<h1>Hello World</h1>`,
			});

			await runWrangler("setup --dry-run");

			expect(
				std.out
					.replace(/- Worker Name: .*?\n/, "- Worker Name: <WORKER_NAME>\n")
					.replace(/"name": ".*?",\n/, '"name": "<WORKER_NAME>",\n')
					.replace(/"directory": ".*?"/, '"directory": "<DIR>"')
					.replace(
						/"compatibility_date": "\d{4}-\d{2}-\d{2}"/,
						'"compatibility_date": "yyyy-mm-dd"'
					)
			).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────

				Detected Project Settings:
				 - Worker Name: <WORKER_NAME>
				 - Framework: Static
				 - Output Directory: public


				📄 Create wrangler.jsonc:
				  {
				    "$schema": "node_modules/wrangler/config-schema.json",
				    "name": "<WORKER_NAME>",
				    "compatibility_date": "yyyy-mm-dd",
				    "observability": {
				      "enabled": true
				    },
				    "assets": {
				      "directory": "<DIR>"
				    },
				    "compatibility_flags": [
				      "nodejs_compat"
				    ]
				  }

				✋  Autoconfig process run in dry-run mode, existing now.
				"
			`);
		});
	});
});
