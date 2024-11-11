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

	it("should error if neither [<directory>] nor [--<command>] command line args were specified", async () => {
		await expect(
			runWrangler("pages dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support \`wrangler.json\`]`
		);
	});

	it("should error if both [<directory>] and [--<command>] command line args were specified", async () => {
		await expect(
			runWrangler("pages dev public -- yarn dev")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support \`wrangler.json\`]`
		);
	});

	it("should error if the [--config] command line arg was specified", async () => {
		await expect(
			runWrangler("pages dev public --config=/path/to/wrangler.toml")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support custom paths for the \`wrangler.toml\` configuration file]`
		);
	});

	it("should error if the [--experimental-json-config] command line arg was specified", async () => {
		await expect(
			runWrangler("pages dev public --experimental-json-config")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support \`wrangler.json\`]`
		);
	});

	it("should error if the [--env] command line arg was specified", async () => {
		await expect(
			runWrangler("pages dev public --env=production")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support \`wrangler.json\`]`
		);
	});
});
