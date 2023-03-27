import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("execute", () => {
	mockConsoleMethods();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	it("should require login when running against prod", async () => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler("d1 execute --command 'select 1;'")
		).rejects.toThrowError(
			`In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work. Please go to https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ for instructions on how to create an api token, and assign its value to CLOUDFLARE_API_TOKEN.`
		);
	});

	it("should expect either --command or --file", async () => {
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

	it("should reject the use of --preview with --local", async () => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});

		await expect(
			runWrangler(`d1 execute db --command "select;" --local --preview`)
		).rejects.toThrowError(`Error: can't use --preview with --local`);
	});

	it("should expect --local when using --persist-to", async () => {
		setIsTTY(false);
		writeWranglerToml({
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		});
		await runWrangler("d1 migrations create db test");

		await expect(
			runWrangler("d1 migrations apply --local db --preview")
		).rejects.toThrowError(`Error: can't use --preview with --local`);
	});
});
