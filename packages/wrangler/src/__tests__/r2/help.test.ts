import { beforeEach, describe, it } from "vitest";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw, mswR2handlers } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("r2", () => {
	const std = mockConsoleMethods();
	beforeEach(() => msw.use(...mswR2handlers));

	runInTempDir();

	describe("help", () => {
		it("should show help when no argument is passed", async ({ expect }) => {
			await runWrangler("r2");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler r2

				📦 Manage R2 buckets & objects

				COMMANDS
				  wrangler r2 object  Manage R2 objects
				  wrangler r2 bucket  Manage R2 buckets
				  wrangler r2 sql     Send queries and manage R2 SQL [open beta]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("should show help when an invalid argument is passed", async ({
			expect,
		}) => {
			await expect(() => runWrangler("r2 asdf")).rejects.toThrow(
				"Unknown argument: asdf"
			);
			await endEventLoop();
			expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: asdf[0m

			"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler r2

				📦 Manage R2 buckets & objects

				COMMANDS
				  wrangler r2 object  Manage R2 objects
				  wrangler r2 bucket  Manage R2 buckets
				  wrangler r2 sql     Send queries and manage R2 SQL [open beta]

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
});
