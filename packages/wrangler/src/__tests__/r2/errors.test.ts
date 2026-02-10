import { describe, it } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("r2 errors", () => {
	mockConsoleMethods();
	runInTempDir();

	it("should throw a helpful error if attempting to put a missing file", async ({
		expect,
	}) => {
		const result = runWrangler(
			`r2 object put bucket-object-test/missing-file.txt --file ./missing-file.txt `
		);

		await expect(result).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: The file "./missing-file.txt" does not exist.]`
		);
	});
});
