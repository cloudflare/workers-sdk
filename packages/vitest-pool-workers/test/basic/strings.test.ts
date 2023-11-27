import { describe, it, expect } from "vitest";

describe("strings", () => {
	it("concatenates", () => {
		expect("a" + "b").toBe("ab");
	});
});
