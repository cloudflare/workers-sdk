import { it } from "vitest";

it("runs in Node.js compatibility mode", ({ expect }) => {
	expect(typeof process).toBe("object");
	expect(process.versions).toBeDefined();
	expect(process.versions.node).toBeDefined();
	expect(typeof Buffer).toBe("function");
});
