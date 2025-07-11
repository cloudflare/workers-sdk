import fs from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { handleResourceBindingAndConfigUpdate, updateJsonConfig } from "../../config/auto-update";
import { configFormat } from "../../config/index";
import { readFileSync } from "../../parse";

// Mock the logger to avoid console output during tests
vi.mock("../../logger", () => ({
	logger: {
		log: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock dialogs to avoid interactive prompts during tests
vi.mock("../../dialogs", () => ({
	confirm: vi.fn().mockResolvedValue(true),
	prompt: vi.fn().mockResolvedValue("TEST_BINDING"),
}));

// Mock parse functions
vi.mock("../../parse", () => ({
	readFileSync: vi.fn(),
}));

// Mock config format
vi.mock("../../config/index", () => ({
	configFormat: vi.fn(),
	formatConfigSnippet: vi.fn((snippet: any) =>
		JSON.stringify(snippet, null, 2)
	),
}));

// Mock auto-update-helpers
vi.mock("../../config/auto-update-helpers", () => ({
	displayConfigSnippet: vi.fn(),
	validateBindingName: vi.fn().mockReturnValue({ valid: true }),
	promptForConfigUpdate: vi.fn().mockResolvedValue(true),
	promptForValidBindingName: vi.fn().mockResolvedValue("TEST_BINDING"),
	getResourceDisplayName: vi.fn().mockReturnValue("Test Resource"),
	getGenericBindingName: vi.fn().mockReturnValue("TEST"),
	createBindingConfig: vi.fn().mockReturnValue({ binding: "TEST", id: "test-id" }),
}));

describe("handleResourceBindingAndConfigUpdate", () => {
	const mockConfigFormat = vi.mocked(configFormat);
	const mockReadFileSync = vi.mocked(readFileSync);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("should display config snippet when no config file path is provided", async () => {
		const config = { name: "worker" };  // No configPath
		const resource = {
			type: "d1_databases" as const,
			id: "test-id",
			name: "test-db",
		};
		const args = {};

		// When no configPath, configFormat should return non-jsonc format to trigger snippet display
		mockConfigFormat.mockReturnValue("toml");
		
		// Should not throw - just display snippet
		await expect(handleResourceBindingAndConfigUpdate(args, config, resource)).resolves.not.toThrow();
	});

	test("should display snippet for unsupported config format (TOML)", async () => {
		const config = { 
			name: "worker",
			configPath: "/path/to/wrangler.toml"
		};
		const resource = {
			type: "d1_databases" as const,
			id: "test-id",
			name: "test-db",
		};
		const args = {};

		mockConfigFormat.mockReturnValue("toml");

		// Should not throw - just display snippet for unsupported format
		await expect(handleResourceBindingAndConfigUpdate(args, config, resource)).resolves.not.toThrow();
	});

	test("should update config with D1 binding when valid binding name provided", async () => {
		const configPath = "/tmp/test-wrangler.jsonc";
		const initialConfig = {
			name: "my-worker",
			compatibility_date: "2023-01-01",
		};

		// Mock file system operations  
		mockReadFileSync.mockReturnValue(JSON.stringify(initialConfig));
		mockConfigFormat.mockReturnValue("jsonc");
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

		// Override the mock to return the specific binding name
		const { createBindingConfig } = await import("../../config/auto-update-helpers");
		vi.mocked(createBindingConfig).mockReturnValue({
			binding: "MY_DB",
			database_name: "test-db",
			database_id: "test-db-id"
		});

		const config = { 
			...initialConfig,
			configPath
		};
		const resource = {
			type: "d1_databases" as const,
			id: "test-db-id",
			name: "test-db",
			binding: "MY_DB"
		};
		const args = { configBindingName: "MY_DB" };

		await handleResourceBindingAndConfigUpdate(args, config, resource);

		expect(fs.writeFileSync).toHaveBeenCalledWith(
			configPath,
			expect.stringContaining('"d1_databases"')
		);
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			configPath,
			expect.stringContaining('"MY_DB"')
		);
	});

	test("should test updateJsonConfig function directly", async () => {
		const configPath = "/tmp/test-wrangler.jsonc";
		const initialConfig = {
			name: "my-worker",
		};

		mockReadFileSync.mockReturnValue(JSON.stringify(initialConfig));
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

		// Override the mock to return the specific binding name
		const { createBindingConfig } = await import("../../config/auto-update-helpers");
		vi.mocked(createBindingConfig).mockReturnValue({
			binding: "MY_DB",
			database_name: "test-db",
			database_id: "test-db-id"
		});

		const resource = {
			type: "d1_databases" as const,
			id: "test-db-id",
			name: "test-db",
			binding: "MY_DB"
		};

		updateJsonConfig(configPath, resource, initialConfig);

		expect(fs.writeFileSync).toHaveBeenCalledWith(
			configPath,
			expect.stringContaining('"d1_databases"')
		);
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			configPath,
			expect.stringContaining('"MY_DB"')
		);
	});

	test("should respect user decline when prompting for update", async () => {
		// Override the specific mock for this test
		const { promptForConfigUpdate } = await import("../../config/auto-update-helpers");
		vi.mocked(promptForConfigUpdate).mockResolvedValueOnce(false);

		const config = {
			name: "my-worker",
			configPath: "/tmp/test-wrangler.jsonc"
		};
		const resource = {
			type: "d1_databases" as const,
			id: "test-db-id",
			name: "test-db",
		};
		const args = {};

		mockReadFileSync.mockReturnValue(JSON.stringify(config));
		mockConfigFormat.mockReturnValue("jsonc");
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

		await handleResourceBindingAndConfigUpdate(args, config, resource);

		expect(fs.writeFileSync).not.toHaveBeenCalled();
		expect(promptForConfigUpdate).toHaveBeenCalledWith("d1_databases");
	});
});
