import { vi } from "vitest";
import isInteractive from "../is-interactive";
import { TURBOREPO } from "../is-turborepo";
import { useMockIsTTY } from "./helpers/mock-istty";
import type { MockInstance } from "vitest";

// Mock the @cloudflare/cli/interactive module
vi.mock("@cloudflare/cli/interactive", () => ({
	isInteractive: () => true, // Mock as always interactive unless overridden
}));

describe("isInteractive", () => {
	const { setIsTTY } = useMockIsTTY();
	let turborepoSpy: MockInstance;

	beforeEach(() => {
		setIsTTY(true);
		turborepoSpy = vi.spyOn(TURBOREPO, "isTurborepo").mockReturnValue(false);
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		turborepoSpy.mockRestore();
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

	it("should return false when running under Turborepo", () => {
		turborepoSpy.mockReturnValue(true);
		expect(isInteractive()).toBe(false);
	});

	it("should return false when running under Turborepo with TURBO_HASH", () => {
		vi.stubEnv("TURBO_HASH", "some-hash");
		turborepoSpy.mockRestore(); // Use real implementation
		expect(isInteractive()).toBe(false);
	});

	it("should return false when running under Turborepo with TURBO_TASK", () => {
		vi.stubEnv("TURBO_TASK", "dev");
		turborepoSpy.mockRestore(); // Use real implementation
		expect(isInteractive()).toBe(false);
	});

	it("should return false when running under Turborepo with npm user agent", () => {
		vi.stubEnv("npm_config_user_agent", "turbo@1.0.0");
		turborepoSpy.mockRestore(); // Use real implementation
		expect(isInteractive()).toBe(false);
	});

	it("should return true when Turborepo environment variables are not set", () => {
		// Ensure no turborepo environment variables are set
		vi.stubEnv("TURBO_HASH", undefined);
		vi.stubEnv("TURBO_TASK", undefined);
		vi.stubEnv("TURBO_INVOCATION_DIR", undefined);
		vi.stubEnv("npm_config_user_agent", "npm@8.0.0");
		
		turborepoSpy.mockRestore(); // Use real implementation
		expect(isInteractive()).toBe(true);
	});

	it("should respect multiple non-interactive conditions", () => {
		vi.stubEnv("CF_PAGES", "1");
		turborepoSpy.mockReturnValue(true);
		expect(isInteractive()).toBe(false);
	});
});