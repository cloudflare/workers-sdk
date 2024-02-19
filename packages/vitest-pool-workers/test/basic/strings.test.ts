import { describe, expect, it } from "vitest";

describe("strings", () => {
	it("concatenates", () => {
		expect("a" + "b").toBe("ab");
	});
});
