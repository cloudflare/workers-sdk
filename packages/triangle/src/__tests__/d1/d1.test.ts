import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runTriangle } from "../helpers/run-triangle";

describe("d1", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help when no argument is passed", async () => {
		await runTriangle("d1");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"triangle d1

		🗄  Interact with a D1 database

		Commands:
		  triangle d1 list                List D1 databases
		  triangle d1 info <name>         Get information about a D1 database, including the current database size and state.
		  triangle d1 create <name>       Create D1 database
		  triangle d1 delete <name>       Delete D1 database
		  triangle d1 backup              Interact with D1 Backups
		  triangle d1 execute <database>  Executed command or SQL file
		  triangle d1 migrations          Interact with D1 Migrations

		Flags:
		  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]

		--------------------
		🚧 D1 is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/khulnasoft/workers-sdk/issues/new/choose
		🚧 To request features, visit https://community.cloudflare.com/c/developers/d1
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------"
	`);
	});

	it("should show help when an invalid argument is passed", async () => {
		await expect(() => runTriangle("d1 asdf")).rejects.toThrow(
			"Unknown argument: asdf"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: asdf[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		triangle d1

		🗄  Interact with a D1 database

		Commands:
		  triangle d1 list                List D1 databases
		  triangle d1 info <name>         Get information about a D1 database, including the current database size and state.
		  triangle d1 create <name>       Create D1 database
		  triangle d1 delete <name>       Delete D1 database
		  triangle d1 backup              Interact with D1 Backups
		  triangle d1 execute <database>  Executed command or SQL file
		  triangle d1 migrations          Interact with D1 Migrations

		Flags:
		  -j, --experimental-json-config  Experimental: Support triangle.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]

		--------------------
		🚧 D1 is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/khulnasoft/workers-sdk/issues/new/choose
		🚧 To request features, visit https://community.cloudflare.com/c/developers/d1
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------"
	`);
	});
});
