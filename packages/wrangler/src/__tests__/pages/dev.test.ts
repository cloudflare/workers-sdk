import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

/**
 * Given that `runWrangler()` mocks out the underlying implementation
 * (see "jest.setup.ts") there's only so much worth testing here.
 */
describe("pages dev", () => {
	runInTempDir();

	it("should error if neither [<directory>] nor [--<command>] command line args were specififed", async () => {
		await expect(
			runWrangler("pages dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Must specify a directory of static assets to serve or a command to run or a proxy port."`
		);
	});

	it("should error if both [<directory>] and [--<command>] command line args were specififed", async () => {
		await expect(
			runWrangler("pages dev public -- yarn dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Specify either a directory OR a proxy command, not both."`
		);
	});

	it("should error if the [--config] command line arg was specififed", async () => {
		await expect(
			runWrangler("pages dev public --config=/path/to/wrangler.toml")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Pages does not support wrangler.toml"`
		);
	});
});
