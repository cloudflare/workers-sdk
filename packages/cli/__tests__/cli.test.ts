import { describe, expect, test } from "vitest";
import { space } from "..";

describe("cli", () => {
	// Fails outside of CI because of ANSI colour codes
	test.skip("test spaces", () => {
		expect(space(300)).toHaveLength(300);
	});
});
