import { test } from "vitest";
import { serverLogs } from "../../../__test-utils__";

test("a worker configs warning is present in the terminal", async ({
	expect,
}) => {
	/**
	 * Note: we always expect the warning once for both values of `isBuild`.
	 *       For dev is obvious, for builds we do get the warning once because we get it when we
	 *       build the application but not when we run its preview (since that reads the generated wrangler.json)
	 */
	expect(serverLogs.warns).toEqual(
		expect.arrayContaining([
			expect.stringMatching(
				/your worker config \(at `.*?wrangler.with-warning.jsonc`\) contains the following configuration options which are ignored since they are not applicable when using Vite:[\s\S]+preserve_file_names/
			),
		])
	);
});
