import { cwd } from "process";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

function endEventLoop() {
	return new Promise((resolve) => setImmediate(resolve));
}

describe("d1", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	it("should show help when no argument is passed", async () => {
		await runWrangler("d1");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler d1

		🗄  Interact with a D1 database

		Commands:
		  wrangler d1 list                List D1 databases
		  wrangler d1 create <name>       Create D1 database
		  wrangler d1 delete <name>       Delete D1 database
		  wrangler d1 backup              Interact with D1 Backups
		  wrangler d1 execute <database>  Executed command or SQL file
		  wrangler d1 migrations          Interact with D1 Migrations

		Flags:
		  -c, --config   Path to .toml configuration file  [string]
		  -e, --env      Environment to use for operations and .env files  [string]
		  -h, --help     Show help  [boolean]
		  -v, --version  Show version number  [boolean]

		🚧 D1 is currently in open alpha and is not recommended for production data and traffic.
		Please report any bugs to https://github.com/cloudflare/wrangler2/issues/new/choose.
		To request features, visit https://community.cloudflare.com/c/developers/d1.
		To give feedback, visit https://discord.gg/cloudflaredev"
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
		  wrangler d1 list                List D1 databases
		  wrangler d1 create <name>       Create D1 database
		  wrangler d1 delete <name>       Delete D1 database
		  wrangler d1 backup              Interact with D1 Backups
		  wrangler d1 execute <database>  Executed command or SQL file
		  wrangler d1 migrations          Interact with D1 Migrations

		Flags:
		  -c, --config   Path to .toml configuration file  [string]
		  -e, --env      Environment to use for operations and .env files  [string]
		  -h, --help     Show help  [boolean]
		  -v, --version  Show version number  [boolean]

		🚧 D1 is currently in open alpha and is not recommended for production data and traffic.
		Please report any bugs to https://github.com/cloudflare/wrangler2/issues/new/choose.
		To request features, visit https://community.cloudflare.com/c/developers/d1.
		To give feedback, visit https://discord.gg/cloudflaredev"
	`);
	});

	describe("migrate", () => {
		describe("apply", () => {
			it("should not attempt to login in local mode", async () => {
				setIsTTY(false);
				writeWranglerToml({
					d1_databases: [
						{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
					],
				});
				// If we get to the point where we are checking for migrations then we have not been asked to log in.
				await expect(
					runWrangler("d1 migrations apply --local DATABASE")
				).rejects.toThrowError(
					`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
				);
			});

			it("should try to read D1 config from wrangler.toml", async () => {
				setIsTTY(false);
				writeWranglerToml();
				await expect(
					runWrangler("d1 migrations apply DATABASE")
				).rejects.toThrowError(
					"Can't find a DB with name/binding 'DATABASE' in local config. Check info in wrangler.toml..."
				);
			});

			it("should not try to read wrangler.toml in local mode", async () => {
				setIsTTY(false);
				writeWranglerToml();
				// If we get to the point where we are checking for migrations then we have not checked wrangler.toml.
				await expect(
					runWrangler("d1 migrations apply --local DATABASE")
				).rejects.toThrowError(
					`No migrations present at ${cwd().replaceAll("\\", "/")}/migrations.`
				);
			});
		});
	});
});
