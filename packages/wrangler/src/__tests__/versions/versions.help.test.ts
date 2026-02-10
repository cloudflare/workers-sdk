import { setImmediate } from "node:timers/promises";
import { describe, test } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";

describe("versions --help", () => {
	const std = mockConsoleMethods();

	test("shows versions help w/ --help", async ({ expect }) => {
		const result = runWrangler("versions --help");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler versions

			🫧 List, view, upload and deploy Versions of your Worker to Cloudflare

			COMMANDS
			  wrangler versions view <version-id>         View the details of a specific version of your Worker
			  wrangler versions list                      List the 10 most recent Versions of your Worker
			  wrangler versions upload [script]           Uploads your Worker code and config as a new Version
			  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions
			  wrangler versions secret                    Generate a secret that can be referenced in a Worker

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});
});

describe("versions subhelp", () => {
	const std = mockConsoleMethods();

	test("shows implicit subhelp", async ({ expect }) => {
		const result = runWrangler("versions");

		await expect(result).resolves.toBeUndefined();
		await setImmediate(); // wait for subhelp

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler versions

			🫧 List, view, upload and deploy Versions of your Worker to Cloudflare

			COMMANDS
			  wrangler versions view <version-id>         View the details of a specific version of your Worker
			  wrangler versions list                      List the 10 most recent Versions of your Worker
			  wrangler versions upload [script]           Uploads your Worker code and config as a new Version
			  wrangler versions deploy [version-specs..]  Safely roll out new Versions of your Worker by splitting traffic between multiple Versions
			  wrangler versions secret                    Generate a secret that can be referenced in a Worker

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});
});
