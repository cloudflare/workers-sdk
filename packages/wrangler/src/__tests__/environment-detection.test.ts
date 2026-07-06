import { describe, it, vi } from "vitest";
import { isAgenticEnvironment } from "../environment-detection";

describe("isAgenticEnvironment", () => {
	it("returns false when no agent env vars are set", ({ expect }) => {
		expect(isAgenticEnvironment()).toBe(false);
	});

	it("returns true when WRANGLER_OUTPUTS_FOR_AGENTS is 'true'", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_OUTPUTS_FOR_AGENTS", "true");
		expect(isAgenticEnvironment()).toBe(true);
	});

	it("returns false when WRANGLER_OUTPUTS_FOR_AGENTS is 'false'", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_OUTPUTS_FOR_AGENTS", "false");
		expect(isAgenticEnvironment()).toBe(false);
	});

	it("throws on invalid WRANGLER_OUTPUTS_FOR_AGENTS values", ({ expect }) => {
		vi.stubEnv("WRANGLER_OUTPUTS_FOR_AGENTS", "1");
		expect(() => isAgenticEnvironment()).toThrow(
			'Expected WRANGLER_OUTPUTS_FOR_AGENTS to be "true" or "false"'
		);
	});

	it("WRANGLER_OUTPUTS_FOR_AGENTS overrides am-i-vibing detection", ({
		expect,
	}) => {
		// Force AI output off even though an agent env var is set
		vi.stubEnv("CLAUDECODE", "1");
		vi.stubEnv("WRANGLER_OUTPUTS_FOR_AGENTS", "false");
		expect(isAgenticEnvironment()).toBe(false);
	});

	it("WRANGLER_OUTPUTS_FOR_AGENTS takes effect without caching", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_OUTPUTS_FOR_AGENTS", "true");
		expect(isAgenticEnvironment()).toBe(true);

		// Changing the env var takes effect immediately (no cache reset needed)
		vi.stubEnv("WRANGLER_OUTPUTS_FOR_AGENTS", "false");
		expect(isAgenticEnvironment()).toBe(false);
	});
});
