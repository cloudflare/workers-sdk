import fs from "node:fs";
import { join } from "path";
import { describe, it } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("execute", () => {
	mockConsoleMethods();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	it("should require login when running against prod", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler("d1 execute db --command 'select 1;' --remote")
		).rejects.toThrowError(
			`In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work. Please go to https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ for instructions on how to create an api token, and assign its value to CLOUDFLARE_API_TOKEN.`
		);
	});

	it("should expect either --command or --file", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(runWrangler("d1 execute db")).rejects.toThrowError(
			`Error: must provide --command or --file`
		);
	});

	it("should reject the use of --remote with --local", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(`d1 execute db --command "select;" --local --remote`)
		).rejects.toThrowError(
			"Error: can't use --local and --remote at the same time"
		);
	});

	it("should reject the use of --preview with --local", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(`d1 execute db --command "select;" --local --preview`)
		).rejects.toThrowError(`Error: can't use --preview without --remote`);
	});

	it("should reject the use of --preview with --local with --json", async ({
		expect,
	}) => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(`d1 execute db --command "select;" --local --preview --json`)
		).rejects.toThrowError(
			JSON.stringify(
				{
					error: {
						text: "Error: can't use --preview without --remote",
					},
				},
				null,
				2
			)
		);
	});

	it("should reject a binary SQLite DB", async ({ expect }) => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});
		const path = join(__dirname, "fixtures", "db.sqlite3");
		fs.copyFileSync(path, "db.sqlite3");

		await expect(
			runWrangler(`d1 execute db --file db.sqlite3 --local --json`)
		).rejects.toThrowError(
			JSON.stringify(
				{
					error: {
						text: "Provided file is a binary SQLite database file instead of an SQL text file. The execute command can only process SQL text files. Please export an SQL file from your SQLite database and try again.",
					},
				},
				null,
				2
			)
		);
	});
});
