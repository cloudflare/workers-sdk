import path from "node:path";
import { beforeEach, describe, it, vi } from "vitest";
import { getPlatformProxy } from "wrangler";

const modernConfigPath = path.join(
	__dirname,
	"..",
	"wrangler_process_env_modern.jsonc"
);
const oldConfigPath = path.join(
	__dirname,
	"..",
	"wrangler_process_env_old.jsonc"
);
const oldWithFlagConfigPath = path.join(
	__dirname,
	"..",
	"wrangler_process_env_old_with_flag.jsonc"
);
const modernDisabledConfigPath = path.join(
	__dirname,
	"..",
	"wrangler_process_env_modern_disabled.jsonc"
);

describe("getPlatformProxy - process.env population", () => {
	beforeEach(() => {
		// Hide stdout messages from the test logs
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	describe("explicit populateProcessEnv option", () => {
		it("populates process.env when populateProcessEnv is true", async ({
			expect,
		}) => {
			const originalMyVar = process.env.MY_VAR;
			const originalMyJsonVar = process.env.MY_JSON_VAR;

			// Use old config (which wouldn't auto-enable) but explicitly enable
			const { dispose } = await getPlatformProxy({
				configPath: oldConfigPath,
				populateProcessEnv: true,
				persist: false,
			});

			try {
				expect(process.env.MY_VAR).toBe("my-var-value");
				expect(process.env.MY_JSON_VAR).toBe(
					JSON.stringify({ test: true, nested: { value: 123 } })
				);
			} finally {
				await dispose();
			}

			expect(process.env.MY_VAR).toEqual(originalMyVar);
			expect(process.env.MY_JSON_VAR).toEqual(originalMyJsonVar);
		});

		it("does NOT populate process.env when populateProcessEnv is false", async ({
			expect,
		}) => {
			// Use modern config (which would auto-enable) but explicitly disable
			const originalMyVar = process.env.MY_VAR;
			const originalMyJsonVar = process.env.MY_JSON_VAR;

			const { dispose } = await getPlatformProxy({
				configPath: modernConfigPath,
				populateProcessEnv: false,
				persist: false,
			});

			try {
				expect(process.env.MY_VAR).toEqual(originalMyVar);
				expect(process.env.MY_JSON_VAR).toEqual(originalMyJsonVar);
			} finally {
				await dispose();
			}
		});
	});

	describe("default behavior based on compat date/flags", () => {
		it("auto-enables for modern compat date (>= 2025-04-01) with nodejs_compat", async ({
			expect,
		}) => {
			const originalMyVar = process.env.MY_VAR;
			const originalMyJsonVar = process.env.MY_JSON_VAR;

			const { dispose } = await getPlatformProxy({
				configPath: modernConfigPath,
				persist: false,
			});

			try {
				expect(process.env.MY_VAR).toBe("my-var-value");
				expect(process.env.MY_JSON_VAR).toBe(
					JSON.stringify({ test: true, nested: { value: 123 } })
				);
			} finally {
				await dispose();
			}

			expect(process.env.MY_VAR).toEqual(originalMyVar);
			expect(process.env.MY_JSON_VAR).toEqual(originalMyJsonVar);
		});

		it("does NOT auto-enable for old compat date (< 2025-04-01)", async ({
			expect,
		}) => {
			const originalMyVar = process.env.MY_VAR;
			const originalMyJsonVar = process.env.MY_JSON_VAR;

			const { dispose } = await getPlatformProxy({
				configPath: oldConfigPath,
				persist: false,
			});

			try {
				expect(process.env.MY_VAR).toEqual(originalMyVar);
				expect(process.env.MY_JSON_VAR).toEqual(originalMyJsonVar);
			} finally {
				await dispose();
			}
		});

		it("auto-enables for old compat date with explicit nodejs_compat_populate_process_env flag", async ({
			expect,
		}) => {
			const originalMyVar = process.env.MY_VAR;
			const originalMyJsonVar = process.env.MY_JSON_VAR;

			const { dispose } = await getPlatformProxy({
				configPath: oldWithFlagConfigPath,
				persist: false,
			});

			try {
				expect(process.env.MY_VAR).toBe("my-var-value");
				expect(process.env.MY_JSON_VAR).toBe(
					JSON.stringify({ test: true, nested: { value: 123 } })
				);
			} finally {
				await dispose();
			}

			expect(process.env.MY_VAR).toEqual(originalMyVar);
			expect(process.env.MY_JSON_VAR).toEqual(originalMyJsonVar);
		});

		it("does NOT auto-enable for modern compat date with nodejs_compat_do_not_populate_process_env flag", async ({
			expect,
		}) => {
			const originalMyVar = process.env.MY_VAR;
			const originalMyJsonVar = process.env.MY_JSON_VAR;

			const { dispose } = await getPlatformProxy({
				configPath: modernDisabledConfigPath,
				persist: false,
			});

			try {
				expect(process.env.MY_VAR).toEqual(originalMyVar);
				expect(process.env.MY_JSON_VAR).toEqual(originalMyJsonVar);
			} finally {
				await dispose();
			}
		});
	});

	describe("dispose() behavior", () => {
		it("restores original process.env values on dispose", async ({
			expect,
		}) => {
			process.env.MY_VAR = "original-value";
			process.env.MY_JSON_VAR = "original-json";

			const { dispose } = await getPlatformProxy({
				configPath: modernConfigPath,
				persist: false,
			});

			expect(process.env.MY_VAR).toBe("my-var-value");
			expect(process.env.MY_JSON_VAR).toBe(
				JSON.stringify({ test: true, nested: { value: 123 } })
			);

			await dispose();

			expect(process.env.MY_VAR).toEqual("original-value");
			expect(process.env.MY_JSON_VAR).toEqual("original-json");

			delete process.env.MY_VAR;
			delete process.env.MY_JSON_VAR;
		});

		it("deletes keys that did not exist before getPlatformProxy was called", async ({
			expect,
		}) => {
			delete process.env.MY_VAR;
			delete process.env.MY_JSON_VAR;

			const { dispose } = await getPlatformProxy({
				configPath: modernConfigPath,
				persist: false,
			});

			expect(process.env.MY_VAR).toBe("my-var-value");
			expect(process.env.MY_JSON_VAR).toBeDefined();

			await dispose();

			expect("MY_VAR" in process.env).toBe(false);
			expect("MY_JSON_VAR" in process.env).toBe(false);
		});
	});

	describe("JSON value handling", () => {
		it("stringifies JSON values when adding to process.env", async ({
			expect,
		}) => {
			const { dispose } = await getPlatformProxy({
				configPath: modernConfigPath,
				persist: false,
			});

			try {
				const jsonValue = process.env.MY_JSON_VAR;
				expect(typeof jsonValue).toBe("string");
				expect(JSON.parse(jsonValue!)).toEqual({
					test: true,
					nested: { value: 123 },
				});
			} finally {
				await dispose();
			}
		});
	});
});
