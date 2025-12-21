import { describe, expect, it } from "vitest";
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

			🗄️ Manage Workers D1 databases

			COMMANDS
			  wrangler d1 create <name>       Creates a new D1 database, and provides the binding and UUID that you will put in your config file
			  wrangler d1 info <name>         Get information about a D1 database, including the current database size and state
			  wrangler d1 list                List all D1 databases in your account
			  wrangler d1 delete <name>       Delete a D1 database
			  wrangler d1 execute <database>  Execute a command or SQL file
			  wrangler d1 export <name>       Export the contents or schema of your database as a .sql file
			  wrangler d1 time-travel         Use Time Travel to restore, fork or copy a database at a specific point-in-time
			  wrangler d1 migrations          Interact with D1 migrations
			  wrangler d1 insights <name>     Get information about the queries run on a D1 database [experimental]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
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

			🗄️ Manage Workers D1 databases

			COMMANDS
			  wrangler d1 create <name>       Creates a new D1 database, and provides the binding and UUID that you will put in your config file
			  wrangler d1 info <name>         Get information about a D1 database, including the current database size and state
			  wrangler d1 list                List all D1 databases in your account
			  wrangler d1 delete <name>       Delete a D1 database
			  wrangler d1 execute <database>  Execute a command or SQL file
			  wrangler d1 export <name>       Export the contents or schema of your database as a .sql file
			  wrangler d1 time-travel         Use Time Travel to restore, fork or copy a database at a specific point-in-time
			  wrangler d1 migrations          Interact with D1 migrations
			  wrangler d1 insights <name>     Get information about the queries run on a D1 database [experimental]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show help when the migrations command is passed", async () => {
		await runWrangler("d1 migrations");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler d1 migrations

			Interact with D1 migrations

			COMMANDS
			  wrangler d1 migrations create <database> <message>  Create a new migration
			  wrangler d1 migrations list <database>              View a list of unapplied migration files
			  wrangler d1 migrations apply <database>             Apply any unapplied D1 migrations

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show help when the time travel command is passed", async () => {
		await runWrangler("d1 time-travel");
		await endEventLoop();
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler d1 time-travel

			Use Time Travel to restore, fork or copy a database at a specific point-in-time

			COMMANDS
			  wrangler d1 time-travel info <database>     Retrieve information about a database at a specific point-in-time using Time Travel
			  wrangler d1 time-travel restore <database>  Restore a database back to a specific point-in-time

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
