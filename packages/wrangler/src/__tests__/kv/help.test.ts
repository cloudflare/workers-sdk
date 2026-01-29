import { afterEach, beforeEach, describe, it, test } from "vitest";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("kv", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();

	const std = mockConsoleMethods();

	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
	});
	afterEach(() => {
		clearDialogs();
	});

	describe("help", () => {
		test("kv --help", async ({ expect }) => {
			const result = runWrangler("kv --help");

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler kv

				🗂️ Manage Workers KV Namespaces

				COMMANDS
				  wrangler kv namespace  Interact with your Workers KV Namespaces
				  wrangler kv key        Individually manage Workers KV key-value pairs
				  wrangler kv bulk       Interact with multiple Workers KV key-value pairs at once

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				      --profile   Authentication profile to use for this command (allows multiple Cloudflare accounts)  [string]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("should show help when no argument is passed", async ({ expect }) => {
			await runWrangler("kv");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler kv

				🗂️ Manage Workers KV Namespaces

				COMMANDS
				  wrangler kv namespace  Interact with your Workers KV Namespaces
				  wrangler kv key        Individually manage Workers KV key-value pairs
				  wrangler kv bulk       Interact with multiple Workers KV key-value pairs at once

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				      --profile   Authentication profile to use for this command (allows multiple Cloudflare accounts)  [string]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("should show help when an invalid argument is passed", async ({
			expect,
		}) => {
			await expect(() => runWrangler("kv asdf")).rejects.toThrow(
				"Unknown argument: asdf"
			);
			expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: asdf[0m

			"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler kv

				🗂️ Manage Workers KV Namespaces

				COMMANDS
				  wrangler kv namespace  Interact with your Workers KV Namespaces
				  wrangler kv key        Individually manage Workers KV key-value pairs
				  wrangler kv bulk       Interact with multiple Workers KV key-value pairs at once

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				      --profile   Authentication profile to use for this command (allows multiple Cloudflare accounts)  [string]
				  -v, --version   Show version number  [boolean]"
			`);
		});
	});
});
