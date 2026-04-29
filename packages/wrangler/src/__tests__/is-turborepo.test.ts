import { describe, it } from "vitest";
import isTurborepo from "../is-turborepo";

describe("isTurborepo", () => {
	it("returns false when turbo env vars are absent", ({ expect }) => {
		expect(isTurborepo({})).toBe(false);
	});

	it("returns true when TURBO_HASH is set", ({ expect }) => {
		expect(isTurborepo({ TURBO_HASH: "abc123" })).toBe(true);
	});

	it("returns true when TURBO_TASK is set", ({ expect }) => {
		expect(isTurborepo({ TURBO_TASK: "dev" })).toBe(true);
	});

	it("returns true when TURBO_INVOCATION_DIR is set", ({ expect }) => {
		expect(isTurborepo({ TURBO_INVOCATION_DIR: "/repo" })).toBe(true);
	});
});
