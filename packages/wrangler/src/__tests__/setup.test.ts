import { seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, expect, test, vi } from "vitest";
import * as c3 from "../autoconfig/c3-vendor/packages";
import * as run from "../autoconfig/run";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

vi.mock("../package-manager", () => ({
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

describe("wrangler setup", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	test("--help", async () => {
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
			  -y, --yes      Answer \\"yes\\" to any prompts for configuring your project  [boolean] [default: false]
			      --build    Run your project's build command once it has been configured  [boolean] [default: false]
			      --dry-run  Runs the command without applying any filesystem modifications  [boolean]"
		`);
	});

	test("should skip autoconfig when project is already configured", async () => {
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

	test("should run autoconfig when project is not configured", async () => {
		await seed({
			"public/index.html": `<h1>Hello World</h1>`,
		});

		// Let's not actually install Wrangler, to speed up tests
		vi.spyOn(c3, "installWrangler").mockImplementation(async () => {});

		const runSpy = vi.spyOn(run, "runAutoConfig");

		await runWrangler("setup");

		// autoconfig should have been run
		expect(runSpy).toHaveBeenCalled();

		expect(std.out).toContain(
			"🎉 Your project is now setup to deploy to Cloudflare"
		);
	});

	describe("--dry-run", () => {
		test("should stop before running autoconfig when project is already configured", async () => {
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

		test("should run autoconfig when project is not configured and stop at the summary step", async () => {
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
				 - Output Directory: <cwd>/public


				📄 Create wrangler.jsonc:
				  {
				    \\"$schema\\": \\"node_modules/wrangler/config-schema.json\\",
				    \\"name\\": \\"<WORKER_NAME>\\",
				    \\"compatibility_date\\": \\"yyyy-mm-dd\\",
				    \\"observability\\": {
				      \\"enabled\\": true
				    },
				    \\"assets\\": {
				      \\"directory\\": \\"<DIR>\\"
				    }
				  }

				✋  Autoconfig process run in dry-run mode, existing now.
				"
			`);
		});
	});
});
