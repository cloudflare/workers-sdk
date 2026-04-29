import { describe, it } from "vitest";
import isTurborepo from "../is-turborepo";

describe("isTurborepo", () => {
	it("returns false when turbo env vars are absent", ({ expect }) => {
		expect(isTurborepo({})).toBe(false);
	});

	it("returns true when TURBO_HASH is set", ({ expect }) => {
		expect(isTurborepo({ TURBO_HASH: "abc123" })).toBe(true);
	});

	it("ignores other turbo env vars without TURBO_HASH", ({ expect }) => {
		expect(
			isTurborepo({ TURBO_TASK: "dev", TURBO_INVOCATION_DIR: "/repo" })
		).toBe(false);
	});
});
