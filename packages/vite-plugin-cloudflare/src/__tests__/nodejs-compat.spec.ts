import { describe, expect, test } from "vitest";
import { nodeBuiltinsRE } from "../nodejs-compat";

// https://github.com/cloudflare/workers-sdk/issues/11751
describe("nodeBuiltinsRE", () => {
	test("matches bare Node.js builtin specifiers", () => {
		expect(nodeBuiltinsRE.test("punycode")).toBe(true);
		expect(nodeBuiltinsRE.test("node:punycode")).toBe(true);
	});

	test("matches the trailing-slash form used to require userland packages over builtins (e.g. `require('punycode/')` in tr46)", () => {
		expect(nodeBuiltinsRE.test("punycode/")).toBe(true);
	});
});
