import { describe, expect, test } from "vitest";
import { getJsonResponse, serverLogs } from "../../../__test-utils__";

describe("multi-worker basic functionality", async () => {
	test("a worker configs warning is present in the terminal", async () => {
		/**
		 * Note: we always expect the warning once for both values of `isBuild`.
		 *       For dev is obvious, for builds we do get the warning once because we get it when we
		 *       build the application but not when we run its preview (since that reads the generated wrangler.json)
		 */
		expect(serverLogs.warns).toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/your workers configs contain configuration options which are ignored[\s\S]+preserve_file_names[\s\S]+tsconfig[\s\S]+build/
				),
			])
		);
	});

	test("entry worker returns a response", async () => {
		const result = await getJsonResponse();
		expect(result).toEqual({ name: "Worker A" });
	});
});
