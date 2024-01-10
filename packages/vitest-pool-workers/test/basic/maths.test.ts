import { describe, it, expect, inject } from "vitest";

describe("maths", () => {
	it("adds", () => {
		expect(1 + 1).toBe(2);
	});

	it("subtracts", () => {
		expect(1 - 1).toBe(0);
	});

	it("gets port", () => {
		expect(inject("port")).toBe(42);
	});
});
