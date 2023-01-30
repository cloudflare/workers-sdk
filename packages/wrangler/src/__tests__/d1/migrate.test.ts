import { cwd } from "process";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("migrate", () => {
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

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
