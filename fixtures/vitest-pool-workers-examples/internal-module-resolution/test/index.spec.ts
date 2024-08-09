import dep from "ext-dep";
import { assert, describe, test } from "vitest";

describe("test", () => {
	test("resolves commonjs directory dependencies correctly", async () => {
		assert.equal(dep, 123);
	});
});
