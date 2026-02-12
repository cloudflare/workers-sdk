import { readFile } from "node:fs/promises";
import { seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, assert, describe, test, vi } from "vitest";
import * as c3 from "../autoconfig/c3-vendor/packages";
import * as run from "../autoconfig/run";
import { clearOutputFilePath } from "../output";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
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

			🪄 Setup a project to work on Cloudflare [experimental]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

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
			.spyOn(c3, "installWrangler")
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

	test("should not display completion message when disabled", async ({
		expect,
	}) => {
		await seed({
			"public/index.html": `<h1>Hello World</h1>`,
		});

		// Let's not actually install Wrangler, to speed up tests
		vi.spyOn(c3, "installWrangler").mockImplementation(async () => {});

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
			.spyOn(c3, "installWrangler")
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
				    }
				  }

				✋  Autoconfig process run in dry-run mode, existing now.
				"
			`);
		});
	});
});
