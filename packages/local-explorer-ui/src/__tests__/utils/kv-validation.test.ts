import { describe, expect, test } from "vitest";
import { MAX_KEY_BYTES, validateKey } from "../../utils/kv-validation";

describe("validateKey", () => {
	test("`MAX_KEY_BYTES` is 512", () => {
		expect(MAX_KEY_BYTES).toBe(512);
	});

	test("empty string returns error", () => {
		expect(validateKey("")).toBe("Key is required");
	});

	test("whitespace-only string returns error", () => {
		expect(validateKey("   ")).toBe("Key is required");
		expect(validateKey("\t")).toBe("Key is required");
	});

	test("valid key returns null", () => {
		expect(validateKey("my-key")).toBeNull();
	});

	test("key at exactly 512 bytes returns null", () => {
		const key = "a".repeat(512);
		expect(validateKey(key)).toBeNull();
	});

	test("key exceeding 512 bytes returns error", () => {
		const key = "a".repeat(513);
		const result = validateKey(key);
		expect(result).toContain("must be 512 bytes or less");
		expect(result).toContain("513 bytes");
	});

	test("multi-byte characters are counted by byte length", () => {
		// Each emoji is 4 bytes in UTF-8
		const key = "\u{1F600}".repeat(128); // 128 * 4 = 512 bytes
		expect(validateKey(key)).toBeNull();

		const tooLong = "\u{1F600}".repeat(129); // 129 * 4 = 516 bytes
		expect(validateKey(tooLong)).toContain("must be 512 bytes or less");
	});
});
