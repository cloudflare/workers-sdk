import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { assert, describe, expect, it } from "vitest";

describe("durable objects", () => {
	it("should throw an error when the worker doesn't export a durable object but requires one", () => {
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
		expect(err).toContain(
			"You should export these objects from your entrypoint, src/index.js."
		);
	});
});
