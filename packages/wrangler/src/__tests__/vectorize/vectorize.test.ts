import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("vectorize", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help when no argument is passed", async () => {
		await runWrangler("vectorize");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler vectorize

		🧮 Interact with Vectorize indexes

		Commands:
			wrangler vectorize create <name>  Create a Vectorize index
			wrangler vectorize delete <name>  Delete a Vectorize index
			wrangler vectorize get <name>     Get a Vectorize index by name
			wrangler vectorize list           List your Vectorize indexes

		Flags:
			-j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
			-c, --config                    Path to .toml configuration file  [string]
			-e, --env                       Environment to use for operations and .env files  [string]
			-h, --help                      Show help  [boolean]
			-v, --version                   Show version number  [boolean]

		--------------------
		📣 Vectorize is currently in open beta
		📣 See the Vectorize docs for how to get started and known issues: https://developers.cloudflare.com/vectorize
		📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		📣 To give feedback, visit https://discord.cloudflare.com/
		---------------------"
		`);
	});

	it("should show help when an invalid argument is passed", async () => {
		await expect(() => runWrangler("vectorize foobarfofum")).rejects.toThrow(
			"Unknown argument: foobarfofum"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foobarfofum[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"wrangler vectorize

		🧮 Interact with Vectorize indexes

		Commands:
			wrangler vectorize create <name>  Create a Vectorize index
			wrangler vectorize delete <name>  Delete a Vectorize index
			wrangler vectorize get <name>     Get a Vectorize index by name
			wrangler vectorize list           List your Vectorize indexes

		Flags:
			-j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
			-c, --config                    Path to .toml configuration file  [string]
			-e, --env                       Environment to use for operations and .env files  [string]
			-h, --help                      Show help  [boolean]
			-v, --version                   Show version number  [boolean]

		--------------------
		📣 Vectorize is currently in open beta
		📣 See the Vectorize docs for how to get started and known issues: https://developers.cloudflare.com/vectorize
		📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		📣 To give feedback, visit https://discord.cloudflare.com/
		--------------------"
	`);
	});

	it("should show help when the get command is passed without an index", async () => {
		await expect(() => runWrangler("vectorize get")).rejects.toThrow(
			"Not enough non-option arguments: got 0, need at least 1"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"wrangler vectorize get <name>

		Get a Vectorize index by name

		Positionals:
			name  The name of the Vectorize index.  [string] [required]

		Flags:
			-j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
			-c, --config                    Path to .toml configuration file  [string]
			-e, --env                       Environment to use for operations and .env files  [string]
			-h, --help                      Show help  [boolean]
			-v, --version                   Show version number  [boolean]

		Options:
					--json  return output as clean JSON  [boolean] [default: false]

		--------------------
		📣 Vectorize is currently in open beta
		📣 See the Vectorize docs for how to get started and known issues: https://developers.cloudflare.com/vectorize
		📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		📣 To give feedback, visit https://discord.cloudflare.com/
		--------------------"
	`);
	});
});
