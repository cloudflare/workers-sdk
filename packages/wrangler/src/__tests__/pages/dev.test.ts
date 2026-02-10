import { describe, it } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

/**
 * Given that `runWrangler()` mocks out the underlying implementation
 * (see "vitest.setup.ts") there's only so much worth testing here.
 */
describe("pages dev", () => {
	runInTempDir();
	mockConsoleMethods();

	it("should error if neither [<directory>] nor [--<command>] command line args were specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Must specify a directory of static assets to serve, or a command to run, or a proxy port, or configure \`pages_build_output_dir\` in your Wrangler configuration file.]`
		);
	});

	it("should error if both [<directory>] and [--<command>] command line args were specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public -- yarn dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Specify either a directory OR a proxy command, not both.]`
		);
	});

	it("should error if the [--config] command line arg was specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public --config=/path/to/wrangler.toml")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support custom paths for the Wrangler configuration file]`
		);
	});

	it("should error if the [--env] command line arg was specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public --env=production")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support targeting an environment with the --env flag during local development.]`
		);
	});
});
