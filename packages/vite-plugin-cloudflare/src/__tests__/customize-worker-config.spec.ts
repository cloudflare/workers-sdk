import { describe, test } from "vitest";
import { customizeWorkerConfig } from "../plugin-config";
import type { PluginConfig, ResolvedWorkerConfig } from "../plugin-config";

// Create a minimal mock config for testing
function createMockWorkerConfig(
	overrides: Partial<ResolvedWorkerConfig> = {}
): ResolvedWorkerConfig {
	return {
		type: "worker",
		name: "test-worker",
		compatibilityDate: "2024-01-01",
		entrypoint: "./src/index.ts",
		compatibilityFlags: [],
		...overrides,
	} as ResolvedWorkerConfig;
}

describe("customizeWorkerConfig", () => {
	test("does not expose the implicit Worker type in inline config", ({
		expect,
	}) => {
		const pluginConfig = {
			config: {
				// @ts-expect-error `type` is implicit for inline Worker config.
				type: "worker",
			},
		} satisfies PluginConfig;

		expect(pluginConfig.config.type).toBe("worker");
	});

	test("should return the original config when config is undefined", ({
		expect,
	}) => {
		const workerConfig = createMockWorkerConfig();
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: undefined,
		});
		expect(result).toEqual(workerConfig);
	});

	test("should merge object configuration into the config", ({ expect }) => {
		const workerConfig = createMockWorkerConfig({
			compatibilityDate: "2024-01-01",
		});
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: {
				compatibilityDate: "2025-01-01",
			},
		});
		expect(result.compatibilityDate).toBe("2025-01-01");
		expect(result.name).toBe("test-worker");
	});

	test("should merge function result into the config", ({ expect }) => {
		const workerConfig = createMockWorkerConfig();
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: (userConfig) => ({
				compatibilityDate: "2025-06-01",
				name: `modified-${userConfig.name}`,
			}),
		});
		expect(result.compatibilityDate).toBe("2025-06-01");
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
		expect(result).toEqual(workerConfig);
	});

	test("should allow function to mutate config in place", ({ expect }) => {
		const workerConfig = createMockWorkerConfig({
			compatibilityDate: "2024-01-01",
		});
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: (userConfig) => {
				userConfig.compatibilityDate = "2025-06-01";
				// Return void to indicate in-place mutation
			},
		});
		// The mutation should be visible after schema validation.
		expect(result.compatibilityDate).toBe("2025-06-01");
	});

	test("should merge compatibilityFlags arrays using defu semantics", ({
		expect,
	}) => {
		const workerConfig = createMockWorkerConfig({
			compatibilityFlags: ["a"],
		});
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: {
				compatibilityFlags: ["b"],
			},
		});
		// defu merges arrays
		expect(result.compatibilityFlags).toEqual(
			expect.arrayContaining(["a", "b"])
		);
	});

	test("should preserve existing config values not specified in customize", ({
		expect,
	}) => {
		const workerConfig = createMockWorkerConfig({
			name: "original-name",
			compatibilityDate: "2024-01-01",
		});
		const result = customizeWorkerConfig({
			workerConfig,
			configCustomizer: {
				compatibilityDate: "2025-01-01",
			},
		});
		expect(result.name).toBe("original-name");
		expect(result.compatibilityDate).toBe("2025-01-01");
	});
});
