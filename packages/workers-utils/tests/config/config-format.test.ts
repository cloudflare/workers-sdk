import { describe, expect, it } from "vitest";
import { configFileName, configFormat } from "../../src/config";

describe("configFormat", () => {
	it("returns 'toml' for .toml files", () => {
		expect(configFormat("wrangler.toml")).toBe("toml");
		expect(configFormat("/path/to/wrangler.toml")).toBe("toml");
	});

	it("returns 'json' for .json files", () => {
		expect(configFormat("wrangler.json")).toBe("json");
		expect(configFormat("/path/to/wrangler.json")).toBe("json");
	});

	it("returns 'jsonc' for .jsonc files", () => {
		expect(configFormat("wrangler.jsonc")).toBe("jsonc");
		expect(configFormat("/path/to/wrangler.jsonc")).toBe("jsonc");
	});

	it("returns 'none' for unknown formats", () => {
		expect(configFormat("wrangler.yaml")).toBe("none");
		expect(configFormat("wrangler.yml")).toBe("none");
		expect(configFormat(undefined)).toBe("none");
	});
});

describe("configFileName", () => {
	it("returns 'wrangler.toml' for .toml config paths", () => {
		expect(configFileName("wrangler.toml")).toBe("wrangler.toml");
		expect(configFileName("/path/to/wrangler.toml")).toBe("wrangler.toml");
	});

	it("returns 'wrangler.json' for .json config paths", () => {
		expect(configFileName("wrangler.json")).toBe("wrangler.json");
		expect(configFileName("/path/to/wrangler.json")).toBe("wrangler.json");
	});

	it("returns 'wrangler.jsonc' for .jsonc config paths", () => {
		expect(configFileName("wrangler.jsonc")).toBe("wrangler.jsonc");
		expect(configFileName("/path/to/wrangler.jsonc")).toBe("wrangler.jsonc");
	});

	it("returns 'Wrangler configuration' for unknown formats", () => {
		expect(configFileName("wrangler.yaml")).toBe("Wrangler configuration");
		expect(configFileName(undefined)).toBe("Wrangler configuration");
	});
});
