import { describe, expect, test, vi } from "vitest";
import * as autoConfigRun from "../autoconfig/run";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { seed } from "./helpers/seed";

describe("wrangler setup", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	test("--help", async () => {
		await runWrangler("setup --help");
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler setup

			🆙 Setup a project to work on Cloudflare [experimental]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	test("should run autoconfig when project is not configured", async () => {
		const runSpy = vi
			.spyOn(autoConfigRun, "runAutoConfig")
			.mockImplementation(() => Promise.resolve());
		await runWrangler("setup");

		expect(runSpy).toHaveBeenCalled();
		expect(std.out).toContain("wrangler deploy");
	});

	test("should skip autoconfig when project is already configured", async () => {
		await seed({
			"wrangler.jsonc": JSON.stringify({ name: "worker" }),
		});

		await runWrangler("setup");

		expect(std.out).toContain(
			"🎉 Your project is already setup to deploy to Cloudflare"
		);
	});
});
