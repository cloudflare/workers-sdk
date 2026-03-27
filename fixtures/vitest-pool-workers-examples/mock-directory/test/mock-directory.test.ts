import { describe, expect, it, vi } from "vitest";

// Test __mocks__ directory support for external packages.
// The __mocks__/mime-types.ts file should be loaded instead of auto-mocking.
vi.mock("mime-types");

// Test __mocks__ directory support for local modules.
// The src/__mocks__/dep.ts file should be loaded instead of auto-mocking.
vi.mock("../src/dep");

describe("__mocks__ directory", () => {
	it("uses __mocks__/mime-types.ts for external package mock", async () => {
		const { lookup } = await import("mime-types");
		expect(lookup("test.html")).toBe("text/mock");
	});

	it("uses src/__mocks__/dep.ts for local module mock", async () => {
		const { getValue } = await import("../src/dep");
		expect(getValue()).toBe("mocked");
	});

	it("greet() uses the mocked dep", async () => {
		const { greet } = await import("../src/index");
		expect(greet()).toBe("Hello, mocked!");
	});
});
