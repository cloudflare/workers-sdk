import { describe, it } from "vitest";
import isNonInteractiveTurborepo from "../is-non-interactive-turborepo";

describe("isNonInteractiveTurborepo", () => {
	it("returns false outside Turborepo", ({ expect }) => {
		expect(isNonInteractiveTurborepo({})).toBe(false);
	});

	it("returns true for Turborepo stream output", ({ expect }) => {
		expect(isNonInteractiveTurborepo({ TURBO_HASH: "test-hash" })).toBe(true);
	});

	it("returns true when Turborepo's TUI is explicitly disabled", ({
		expect,
	}) => {
		expect(
			isNonInteractiveTurborepo({
				TURBO_HASH: "test-hash",
				TURBO_IS_TUI: "false",
			})
		).toBe(true);
	});

	it("returns false for Turborepo's interactive terminal UI", ({ expect }) => {
		expect(
			isNonInteractiveTurborepo({
				TURBO_HASH: "test-hash",
				TURBO_IS_TUI: "true",
			})
		).toBe(false);
	});
});
