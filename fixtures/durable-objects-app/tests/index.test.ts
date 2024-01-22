import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { assert, describe, it } from "vitest";

describe("durable objects", () => {
	it("should throw an error when the worker doesn't export a durable object but requires one", ({
		expect,
	}) => {
		let err: string = "";
		try {
			execSync("pnpm run dev", {
				cwd: resolve(__dirname, ".."),
			});
			assert(false); // Should never reach this
		} catch (e) {
			err = (e as Error).message
				.replaceAll("✘", "X")
				.replace(/\\/g, "/")
				.replace(/[^\S\n]+\n/g, "\n")
				.trimEnd();
		}
		expect(err).toMatchInlineSnapshot(`
			"Command failed: pnpm run dev
			[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYour Worker depends on the following Durable Objects, which are not exported in your entrypoint file: FooBar.[0m

			  You should export these objects from your entrypoint, src/index.js."
		`);
	});
});
