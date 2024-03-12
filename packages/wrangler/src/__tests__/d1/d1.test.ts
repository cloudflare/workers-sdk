import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("d1", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help when no argument is passed", async () => {
		await runWrangler("d1");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler d1

		🔹Manage Workers D1 databases open beta

		Commands:
		  wrangler d1 list                🔹List D1 databases
		  wrangler d1 info <name>         🔹Get information about a D1 database, including the current database size and state
			wrangler d1 insights <name>     🔹Experimental command. Get information about the queries run on a D1 database
		  wrangler d1 create <name>       🔹Create D1 database
		  wrangler d1 delete <name>       🔹Delete D1 database
		  wrangler d1 backup              🔹Interact with D1 backups
		  wrangler d1 execute <database>  🔹Execute a command or SQL file
		  wrangler d1 time-travel         🔹Use Time Travel to restore, fork or copy a database at a specific point-in-time
		  wrangler d1 migrations          🔹Interact with D1 migrations

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]

		--------------------
		🚧 D1 is currently in open beta
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		--------------------"
	`);
	});

	it("should show help when an invalid argument is passed", async () => {
		await expect(() => runWrangler("d1 asdf")).rejects.toThrow(
			"Unknown argument: asdf"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: asdf[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		wrangler d1

		🔹Manage Workers D1 databases open beta

		Commands:
		  wrangler d1 list                🔹List D1 databases
		  wrangler d1 info <name>         🔹Get information about a D1 database, including the current database size and state
			wrangler d1 insights <name>     🔹Experimental command. Get information about the queries run on a D1 database
		  wrangler d1 create <name>       🔹Create D1 database
		  wrangler d1 delete <name>       🔹Delete D1 database
		  wrangler d1 backup              🔹Interact with D1 backups
		  wrangler d1 execute <database>  🔹Execute a command or SQL file
		  wrangler d1 time-travel         🔹Use Time Travel to restore, fork or copy a database at a specific point-in-time
		  wrangler d1 migrations          🔹Interact with D1 migrations

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]

		--------------------
		🚧 D1 is currently in open beta
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		--------------------"
	`);
	});

	it("should show help when the migrations command is passed", async () => {
		await expect(() => runWrangler("d1 migrations")).rejects.toThrow(
			"Not enough non-option arguments: got 0, need at least 1"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		wrangler d1 migrations

		🔹Interact with D1 migrations

		Commands:
		  wrangler d1 migrations list <database>              🔹List your D1 migrations
		  wrangler d1 migrations create <database> <message>  🔹Create a new migration
		  wrangler d1 migrations apply <database>             🔹Apply D1 migrations

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]

		--------------------
		🚧 D1 is currently in open beta
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		--------------------"
	`);
	});

	it("should show help when the time travel command is passed", async () => {
		await expect(() => runWrangler("d1 time-travel")).rejects.toThrow(
			"Not enough non-option arguments: got 0, need at least 1"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		wrangler d1 time-travel

		🔹Use Time Travel to restore, fork or copy a database at a specific point-in-time

		Commands:
		  wrangler d1 time-travel info <database>     🔹Retrieve information about a database at a specific point-in-time
		  wrangler d1 time-travel restore <database>  🔹Restore a database back to a specific point-in-time

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]"
	`);
	});
});
