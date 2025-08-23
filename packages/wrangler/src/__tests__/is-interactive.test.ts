import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import isInteractive from "../is-interactive";
import { useMockIsTTY } from "./helpers/mock-istty";

vi.mock("@cloudflare/cli/interactive", () => ({
	isInteractive: () => true,
}));

describe("isInteractive", () => {
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(true);
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should return true when running in an interactive environment", () => {
		expect(isInteractive()).toBe(true);
	});

	it("should return false when running in Pages CI", () => {
		vi.stubEnv("CF_PAGES", "1");
		expect(isInteractive()).toBe(false);
	});

	it("should return false when running in Workers CI", () => {
		vi.stubEnv("WORKERS_CI", "1");
		expect(isInteractive()).toBe(false);
	});

	it("should return true when Turborepo environment variables are set (turborepo detection moved to dev command)", () => {
		vi.stubEnv("TURBO_HASH", "some-hash");
		vi.stubEnv("TURBO_TASK", "dev");
		vi.stubEnv("npm_config_user_agent", "turbo@1.0.0");
		expect(isInteractive()).toBe(true);
	});

	it("should respect multiple non-interactive conditions", () => {
		vi.stubEnv("CF_PAGES", "1");
		vi.stubEnv("WORKERS_CI", "1");
		expect(isInteractive()).toBe(false);
	});
});
