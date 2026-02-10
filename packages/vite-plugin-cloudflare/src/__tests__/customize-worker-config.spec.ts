import { describe, test } from "vitest";
import { customizeWorkerConfig } from "../plugin-config";
import type { ResolvedWorkerConfig } from "../plugin-config";

// Create a minimal mock config for testing
function createMockWorkerConfig(
	overrides: Partial<ResolvedWorkerConfig> = {}
): ResolvedWorkerConfig {
	return {
		name: "test-worker",
		topLevelName: "test-worker",
		compatibility_date: "2024-01-01",
		main: "./src/index.ts",
		compatibility_flags: [],
		limits: {},
		rules: [],
		...overrides,
	} as ResolvedWorkerConfig;
}

describe("customizeWorkerConfig", () => {
	test("should return the original config when config is undefined", ({
		expect,
	}) => {
		const workerConfig = createMockWorkerConfig();
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: undefined,
		});
		expect(result).toBe(workerConfig);
	});

	test("should merge object configuration into the config", ({ expect }) => {
		const workerConfig = createMockWorkerConfig({
			compatibility_date: "2024-01-01",
		});
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: {
				compatibility_date: "2025-01-01",
			},
		});
		expect(result.compatibility_date).toBe("2025-01-01");
		expect(result.name).toBe("test-worker");
	});

	test("should merge function result into the config", ({ expect }) => {
		const workerConfig = createMockWorkerConfig();
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: (userConfig) => ({
				compatibility_date: "2025-06-01",
				name: `modified-${userConfig.name}`,
			}),
		});
		expect(result.compatibility_date).toBe("2025-06-01");
		expect(result.name).toBe("modified-test-worker");
	});

	test("should return original config when function returns undefined/void", ({
		expect,
	}) => {
		const workerConfig = createMockWorkerConfig();
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: () => {
				// Function that returns void/undefined
			},
		});
		expect(result).toBe(workerConfig);
	});

	test("should allow function to mutate config in place", ({ expect }) => {
		const workerConfig = createMockWorkerConfig({
			compatibility_date: "2024-01-01",
		});
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: (userConfig) => {
				userConfig.compatibility_date = "2025-06-01";
				// Return void to indicate in-place mutation
			},
		});
		// The original config should be returned (same reference)
		expect(result).toBe(workerConfig);
		// And the mutation should be visible
		expect(result.compatibility_date).toBe("2025-06-01");
	});

	test("should merge compatibility_flags arrays using defu semantics", ({
		expect,
	}) => {
		const workerConfig = createMockWorkerConfig({
			compatibility_flags: ["a"],
		});
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: {
				compatibility_flags: ["b"],
			},
		});
		// defu merges arrays
		expect(result.compatibility_flags).toEqual(
			expect.arrayContaining(["a", "b"])
		);
	});

	test("should preserve existing config values not specified in customize", ({
		expect,
	}) => {
		const workerConfig = createMockWorkerConfig({
			name: "original-name",
			compatibility_date: "2024-01-01",
		});
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: {
				compatibility_date: "2025-01-01",
			},
		});
		expect(result.name).toBe("original-name");
		expect(result.compatibility_date).toBe("2025-01-01");
	});
});
