import fs from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { autoUpdateWranglerConfig } from "../../config/auto-update";
import { findWranglerConfig } from "../../config/config-helpers";
import { configFormat } from "../../config/index";
import { parseJSONC, readFileSync } from "../../parse";

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
}));

// Mock findWranglerConfig
vi.mock("../../config/config-helpers", () => ({
	findWranglerConfig: vi.fn(),
}));

// Mock parse functions
vi.mock("../../parse", () => ({
	readFileSync: vi.fn(),
	parseJSONC: vi.fn(),
}));

// Mock config format
vi.mock("../../config/index", () => ({
	configFormat: vi.fn(),
	formatConfigSnippet: vi.fn((snippet: any) =>
		JSON.stringify(snippet, null, 2)
	),
}));

// Mock getValidBindingName
vi.mock("../../utils/getValidBindingName", () => ({
	getValidBindingName: vi.fn((name: string, fallback: string) => {
		// Simple mock implementation for testing
		return name.toUpperCase().replace(/[^A-Z0-9_]/g, "_") || fallback;
	}),
}));

describe("autoUpdateWranglerConfig", () => {
	const mockFindWranglerConfig = vi.mocked(findWranglerConfig);
	const mockConfigFormat = vi.mocked(configFormat);
	const mockReadFileSync = vi.mocked(readFileSync);
	const mockParseJSONC = vi.mocked(parseJSONC);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("should return false when no config file is found", async () => {
		mockFindWranglerConfig.mockReturnValue({
			configPath: undefined,
			userConfigPath: undefined,
		});

		const result = await autoUpdateWranglerConfig({
			type: "d1_databases",
			id: "test-id",
			name: "test-db",
		});

		expect(result).toBe(false);
	});

	test("should return false for unsupported config format (TOML)", async () => {
		mockFindWranglerConfig.mockReturnValue({
			configPath: "/path/to/wrangler.toml",
			userConfigPath: "/path/to/wrangler.toml",
		});
		mockConfigFormat.mockReturnValue("toml");

		const result = await autoUpdateWranglerConfig({
			type: "d1_databases",
			id: "test-id",
			name: "test-db",
		});

		expect(result).toBe(false);
	});

	test("should create proper D1 binding configuration with auto-update", async () => {
		const configPath = "/tmp/test-wrangler.json";
		const initialConfig = {
			name: "my-worker",
			compatibility_date: "2023-01-01",
		};

		// Mock file system operations
		mockReadFileSync.mockReturnValue(JSON.stringify(initialConfig));
		mockParseJSONC.mockReturnValue(initialConfig);
		mockConfigFormat.mockReturnValue("jsonc");
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

		mockFindWranglerConfig.mockReturnValue({
			configPath,
			userConfigPath: configPath,
		});

		const result = await autoUpdateWranglerConfig(
			{
				type: "d1_databases",
				id: "test-db-id",
				name: "test-db",
			},
			true
		); // auto-update enabled

		expect(result).toBe(true);
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			configPath,
			expect.stringContaining('"d1_databases"')
		);
	});

	test("should create proper R2 binding configuration with auto-update", async () => {
		const configPath = "/tmp/test-wrangler.json";
		const initialConfig = {
			name: "my-worker",
		};

		mockReadFileSync.mockReturnValue(JSON.stringify(initialConfig));
		mockParseJSONC.mockReturnValue(initialConfig);
		mockConfigFormat.mockReturnValue("jsonc");
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

		mockFindWranglerConfig.mockReturnValue({
			configPath,
			userConfigPath: configPath,
		});

		const result = await autoUpdateWranglerConfig(
			{
				type: "r2_buckets",
				id: "test-bucket",
				name: "test-bucket",
			},
			true
		); // auto-update enabled

		expect(result).toBe(true);
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			configPath,
			expect.stringContaining('"r2_buckets"')
		);
	});

	test("should not add duplicate bindings", async () => {
		const configPath = "/tmp/test-wrangler.json";
		const initialConfig = {
			name: "my-worker",
			d1_databases: [
				{
					binding: "DB",
					database_name: "test-db",
					database_id: "test-db-id",
				},
			],
		};

		mockReadFileSync.mockReturnValue(JSON.stringify(initialConfig));
		mockParseJSONC.mockReturnValue(initialConfig);
		mockConfigFormat.mockReturnValue("jsonc");
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

		mockFindWranglerConfig.mockReturnValue({
			configPath,
			userConfigPath: configPath,
		});

		const result = await autoUpdateWranglerConfig(
			{
				type: "d1_databases",
				id: "test-db-id",
				name: "test-db",
			},
			true
		); // auto-update enabled

		expect(result).toBe(false);
		// Should not call writeFileSync since binding already exists
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});

	test("should generate unique binding name when conflicts exist", async () => {
		const configPath = "/tmp/test-wrangler.json";
		const initialConfig = {
			name: "my-worker",
			d1_databases: [
				{
					binding: "DB",
					database_name: "existing-db",
					database_id: "existing-db-id",
				},
			],
			r2_buckets: [
				{
					binding: "DB_1",
					bucket_name: "existing-bucket",
				},
			],
		};

		mockReadFileSync.mockReturnValue(JSON.stringify(initialConfig));
		mockParseJSONC.mockReturnValue(initialConfig);
		mockConfigFormat.mockReturnValue("jsonc");
		const writeFileSyncSpy = vi
			.spyOn(fs, "writeFileSync")
			.mockImplementation(() => {});

		mockFindWranglerConfig.mockReturnValue({
			configPath,
			userConfigPath: configPath,
		});

		const result = await autoUpdateWranglerConfig(
			{
				type: "d1_databases",
				id: "new-test-db-id",
				name: "test-db", // Will use generic name "DB"
			},
			true
		); // auto-update enabled

		expect(result).toBe(true);
		expect(writeFileSyncSpy).toHaveBeenCalledWith(
			configPath,
			expect.stringContaining('"DB_2"') // Should generate DB_2 to avoid conflicts with DB and DB_1
		);
	});

	test("should handle case-insensitive binding name conflicts", async () => {
		const configPath = "/tmp/test-wrangler.json";
		const initialConfig = {
			name: "my-worker",
			d1_databases: [
				{
					binding: "bucket", // lowercase to conflict with R2's "BUCKET"
					database_name: "existing-db",
					database_id: "existing-db-id",
				},
			],
		};

		mockReadFileSync.mockReturnValue(JSON.stringify(initialConfig));
		mockParseJSONC.mockReturnValue(initialConfig);
		mockConfigFormat.mockReturnValue("jsonc");
		const writeFileSyncSpy = vi
			.spyOn(fs, "writeFileSync")
			.mockImplementation(() => {});

		mockFindWranglerConfig.mockReturnValue({
			configPath,
			userConfigPath: configPath,
		});

		const result = await autoUpdateWranglerConfig(
			{
				type: "r2_buckets",
				id: "new-bucket-id",
				name: "test-bucket", // Will use generic name "BUCKET" but conflicts with "bucket"
			},
			true
		); // auto-update enabled

		expect(result).toBe(true);
		expect(writeFileSyncSpy).toHaveBeenCalledWith(
			configPath,
			expect.stringContaining('"BUCKET_1"') // Should generate BUCKET_1 due to case-insensitive conflict
		);
	});

	test("should not auto-update for KV preview namespaces", async () => {
		// This test documents that KV preview namespaces should be handled
		// differently in the KV create command, not in the auto-update module

		// Mock no config file found
		mockFindWranglerConfig.mockReturnValue({
			configPath: undefined,
			userConfigPath: undefined,
		});

		const result = await autoUpdateWranglerConfig(
			{
				type: "kv_namespaces",
				id: "preview-kv-id",
				name: "preview-namespace",
				additionalConfig: { preview_id: "preview-kv-id" },
			},
			true
		);

		// The auto-update module itself doesn't distinguish preview vs regular
		// The KV command should skip calling auto-update for preview namespaces
		expect(result).toBe(false); // No config file found, so returns false
	});

	test("should respect user decline when prompting for update", async () => {
		const { confirm } = await import("../../dialogs");
		vi.mocked(confirm).mockResolvedValueOnce(false);

		const configPath = "/tmp/test-wrangler.json";
		const initialConfig = { name: "my-worker" };

		mockReadFileSync.mockReturnValue(JSON.stringify(initialConfig));
		mockParseJSONC.mockReturnValue(initialConfig);
		mockConfigFormat.mockReturnValue("jsonc");
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

		mockFindWranglerConfig.mockReturnValue({
			configPath,
			userConfigPath: configPath,
		});

		const result = await autoUpdateWranglerConfig(
			{
				type: "d1_databases",
				id: "test-db-id",
				name: "test-db",
			},
			false
		); // auto-update disabled, should prompt

		expect(result).toBe(false);
		expect(fs.writeFileSync).not.toHaveBeenCalled();
		expect(confirm).toHaveBeenCalledWith(
			expect.stringContaining(
				"Would you like to update the wrangler.jsonc file"
			),
			{ defaultValue: true, fallbackValue: false }
		);
	});
});
