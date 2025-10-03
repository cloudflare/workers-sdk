import fs from "node:fs";
import { join } from "path";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";

describe("execute", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	// We turn on SENTRY reporting so that we can prove that Wrangler will not attempt to report user errors.
	useSentry();

	it("should require login when running against prod", async () => {
		setIsTTY(false);
		writeWranglerConfig({
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

	it("should expect either --command or --file", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(runWrangler("d1 execute db")).rejects.toThrowError(
			`Error: must provide --command or --file`
		);
	});

	it("should reject use of both --command and --file", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(
				"d1 execute db --command='SELECT * FROM CUSTOMERS' --file=query.sql"
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Error: can't provide both --command and --file.]`
		);
		expect(std.out).not.toMatch(
			"Would you like to report this error to Cloudflare?"
		);
	});

	it("should reject the use of --remote with --local", async () => {
		setIsTTY(false);
		writeWranglerConfig({
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

	it("should reject the use of --preview with --local", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(`d1 execute db --command "select;" --local --preview`)
		).rejects.toThrowError(`Error: can't use --preview without --remote`);
	});

	it("should reject the use of --preview with --local with --json", async () => {
		setIsTTY(false);
		writeWranglerConfig({
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

	it("should reject a binary SQLite DB", async () => {
		setIsTTY(false);
		writeWranglerConfig({
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

	it("should throw a UserError if file does not exist", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(runWrangler(`d1 execute db --file missing.sql --local --json`))
			.rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: {
			  "error": {
			    "text": "Unable to read SQL text file /"missing.sql/". Please check the file path and try again."
			  }
			}]
		`);
	});

	it("should show banner by default", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await runWrangler("d1 execute db --command 'select 1;'");
		expect(std.out).toContain("⛅️ wrangler x.x.x");
	});
	it("should not show banner if --json=true", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await runWrangler("d1 execute db --command 'select 1;' --json");
		expect(std.out).not.toContain("⛅️ wrangler x.x.x");
	});
});

function useSentry() {
	// @ts-expect-error TS does not know about SENTRY_DSN
	const oldSentryDsn = global.SENTRY_DSN;
	beforeEach(() => {
		// @ts-expect-error TS does not know about SENTRY_DSN
		global.SENTRY_DSN = "FAKE_VALUE";
	});
	afterEach(() => {
		// @ts-expect-error TS does not know about SENTRY_DSN
		global.SENTRY_DSN = oldSentryDsn;
	});
}
