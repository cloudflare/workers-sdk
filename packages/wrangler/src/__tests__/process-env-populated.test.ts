import { assert, describe, test } from "vitest";
import { isProcessEnvPopulated } from "../process-env";

describe("isProcessEnvPopulated", () => {
	test("default", ({ expect }) => {
		expect(isProcessEnvPopulated(undefined, ["nodejs_compat"])).toBe(false);
	});

	test("future date", ({ expect }) => {
		expect(isProcessEnvPopulated("2026-01-01", ["nodejs_compat"])).toBe(true);
	});

	test("old date", ({ expect }) => {
		expect(isProcessEnvPopulated("2000-01-01", ["nodejs_compat"])).toBe(false);
	});

	test("switch date", ({ expect }) => {
		expect(isProcessEnvPopulated("2025-04-01", ["nodejs_compat"])).toBe(true);
	});

	test("old date, but with flag", ({ expect }) => {
		expect(
			isProcessEnvPopulated("2000-01-01", [
				"nodejs_compat",
				"nodejs_compat_populate_process_env",
			])
		).toBe(true);
	});

	test("old date, with disable flag", ({ expect }) => {
		expect(
			isProcessEnvPopulated("2000-01-01", [
				"nodejs_compat",
				"nodejs_compat_do_not_populate_process_env",
			])
		).toBe(false);
	});

	test("future date, but with disable flag", ({ expect }) => {
		expect(
			isProcessEnvPopulated("2026-01-01", [
				"nodejs_compat",
				"nodejs_compat_do_not_populate_process_env",
			])
		).toBe(false);
	});

	test("future date, with enable flag", ({ expect }) => {
		expect(
			isProcessEnvPopulated("2026-01-01", [
				"nodejs_compat",
				"nodejs_compat_populate_process_env",
			])
		).toBe(true);
	});

	test("future date without nodejs_compat", ({ expect }) => {
		expect(isProcessEnvPopulated("2026-01-01")).toBe(false);
	});

	test("future date, with enable flag but without nodejs_compat", ({
		expect,
	}) => {
		expect(
			isProcessEnvPopulated("2026-01-01", [
				"nodejs_compat_populate_process_env",
			])
		).toBe(false);
	});

	test("errors with disable and enable flags specified", ({ expect }) => {
		try {
			isProcessEnvPopulated("2024-01-01", [
				"nodejs_compat_populate_process_env",
				"nodejs_compat_do_not_populate_process_env",
			]);
			assert(false, "Unreachable");
		} catch (e) {
			expect(e).toMatchInlineSnapshot(
				`[Error: Can't both enable and disable a flag]`
			);
		}
	});
});
