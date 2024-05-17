/**
 * Given that `runWrangler()` mocks out the underlying implementation
 * (see "vi.setup.ts") there's only so much worth testing here.
 */
import { describe, it } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("pages dev", () => {
	runInTempDir();
	mockConsoleMethods();

	it("should error if neither [<directory>] nor [--<command>] command line args were specififed", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Must specify a directory of static assets to serve, or a command to run, or a proxy port, or configure \`pages_build_output_dir\` in \`wrangler.toml\`."`
		);
	});

	it("should error if both [<directory>] and [--<command>] command line args were specififed", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public -- yarn dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Specify either a directory OR a proxy command, not both."`
		);
	});

	it("should error if the [--config] command line arg was specififed", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public --config=/path/to/wrangler.toml")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Pages does not support custom paths for the \`wrangler.toml\` configuration file"`
		);
	});

	it("should error if the [--experimental-json-config] command line arg was specififed", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public --experimental-json-config")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Pages does not support \`wrangler.json\`"`
		);
	});

	it("should error if the [--env] command line arg was specififed", async ({
		expect,
	}) => {
		await expect(
			runWrangler("pages dev public --env=production")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Pages does not support targeting an environment with the --env flag. Use the --branch flag to target your production or preview branch"`
		);
	});
});
