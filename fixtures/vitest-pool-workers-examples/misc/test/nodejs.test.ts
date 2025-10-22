import { afterEach, beforeEach, expect, it, vi } from "vitest";

it("runs in Node.js compatibility mode", () => {
	expect(typeof process).toBe("object");
	expect(process.versions).toBeDefined();
	expect(process.versions.node).toBeDefined();
	expect(typeof Buffer).toBe("function");
});
