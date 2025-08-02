import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURBOREPO } from "../is-turborepo";

describe("TURBOREPO", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("isTurborepo()", () => {
		it("should return false when no turborepo environment variables are set", () => {
			vi.stubEnv("TURBO_HASH", undefined);
			vi.stubEnv("TURBO_TASK", undefined);
			vi.stubEnv("TURBO_INVOCATION_DIR", undefined);
			vi.stubEnv("npm_config_user_agent", undefined);
			expect(TURBOREPO.isTurborepo()).toBe(false);
		});

		it("should return true when TURBO_HASH is set", () => {
			vi.stubEnv("TURBO_HASH", "some-hash-value");
			expect(TURBOREPO.isTurborepo()).toBe(true);
		});

		it("should return true when TURBO_TASK is set", () => {
			vi.stubEnv("TURBO_TASK", "dev");
			expect(TURBOREPO.isTurborepo()).toBe(true);
		});

		it("should return true when TURBO_INVOCATION_DIR is set", () => {
			vi.stubEnv("TURBO_INVOCATION_DIR", "/some/project/dir");
			expect(TURBOREPO.isTurborepo()).toBe(true);
		});

		it("should return true when npm_config_user_agent contains 'turbo'", () => {
			vi.stubEnv("npm_config_user_agent", "npm/1.0.0 node/20.0.0 turbo/1.2.3");
			expect(TURBOREPO.isTurborepo()).toBe(true);
		});

		it("should return true when npm_config_user_agent contains turbo anywhere in the string", () => {
			vi.stubEnv("npm_config_user_agent", "turbo-cli@1.0.0");
			expect(TURBOREPO.isTurborepo()).toBe(true);
		});

		it("should return false when npm_config_user_agent does not contain 'turbo'", () => {
			vi.stubEnv("TURBO_HASH", undefined);
			vi.stubEnv("TURBO_TASK", undefined);
			vi.stubEnv("TURBO_INVOCATION_DIR", undefined);
			vi.stubEnv("npm_config_user_agent", "npm/1.0.0 node/20.0.0");
			expect(TURBOREPO.isTurborepo()).toBe(false);
		});

		it("should return true when multiple turborepo environment variables are set", () => {
			vi.stubEnv("TURBO_HASH", "some-hash");
			vi.stubEnv("TURBO_TASK", "dev");
			vi.stubEnv("TURBO_INVOCATION_DIR", "/project");
			expect(TURBOREPO.isTurborepo()).toBe(true);
		});

		it("should handle undefined npm_config_user_agent gracefully", () => {
			vi.stubEnv("TURBO_HASH", undefined);
			vi.stubEnv("TURBO_TASK", undefined);
			vi.stubEnv("TURBO_INVOCATION_DIR", undefined);
			vi.stubEnv("npm_config_user_agent", undefined);
			expect(TURBOREPO.isTurborepo()).toBe(false);
		});

	});
});
