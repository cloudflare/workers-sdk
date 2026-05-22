import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
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
			`[Error: Cannot specify both a directory and a proxy command. Provide either a directory of static assets or a proxy command, not both.]`
		);
	});

	it("should error if the [--config] command line arg was specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public --config=/path/to/wrangler.toml")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support custom paths for the Wrangler configuration file. Remove the --config flag, or use a standard wrangler.jsonc in your project root.]`
		);
	});

	it("should error if the [--env] command line arg was specified", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public --env=production")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support the --env flag during local development. Use the --branch flag to target your production or preview environment instead.]`
		);
	});
});
