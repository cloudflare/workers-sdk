import { mockAccountId } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

function endEventLoop() {
	return new Promise((resolve) => setImmediate(resolve));
}

describe("d1", () => {
	const std = mockConsoleMethods();

	mockAccountId();

	it("should show help when no argument is passed", async () => {
		await runWrangler("d1");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler d1

		🗄  Interact with a D1 database

		Commands:
		  wrangler d1 list            List D1 databases
		  wrangler d1 create <name>   Create D1 database
		  wrangler d1 delete <name>   Delete D1 database
		  wrangler d1 backup          Interact with D1 Backups
		  wrangler d1 execute <name>  Executed command or SQL file

		Flags:
		  -c, --config   Path to .toml configuration file  [string]
		  -h, --help     Show help  [boolean]
		  -v, --version  Show version number  [boolean]

		🚧 'wrangler d1 <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"
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

		🗄  Interact with a D1 database

		Commands:
		  wrangler d1 list            List D1 databases
		  wrangler d1 create <name>   Create D1 database
		  wrangler d1 delete <name>   Delete D1 database
		  wrangler d1 backup          Interact with D1 Backups
		  wrangler d1 execute <name>  Executed command or SQL file

		Flags:
		  -c, --config   Path to .toml configuration file  [string]
		  -h, --help     Show help  [boolean]
		  -v, --version  Show version number  [boolean]

		🚧 'wrangler d1 <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"
	`);
	});
});
