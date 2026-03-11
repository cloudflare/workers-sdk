import path from "node:path";
import { describe, it } from "vitest";
import { getLocalPersistencePath } from "../../dev/get-local-persistence-path";
import { runInTempDir } from "../helpers/run-in-tmp";
import type { Config } from "@cloudflare/workers-utils";

function makeConfig(userConfigPath?: string): Config {
	return {
		userConfigPath,
	} as Config;
}

describe("getLocalPersistencePath", () => {
	runInTempDir();

	describe("when persistence is disabled", () => {
		it("should return `false` when `persistTo` is `false`", ({ expect }) => {
			const result = getLocalPersistencePath(false, makeConfig());
			expect(result).toBe(false);
		});
	});

	describe("when persistence is enabled with default path", () => {
		it("should return `.wrangler/state` relative to cwd when no config path", ({
			expect,
		}) => {
			const result = getLocalPersistencePath(undefined, makeConfig());
			expect(result).toBe(path.resolve(process.cwd(), ".wrangler/state"));
		});

		it("should return `.wrangler/state` relative to config file directory", ({
			expect,
		}) => {
			const configPath = "/some/project/wrangler.json";
			const result = getLocalPersistencePath(undefined, makeConfig(configPath));
			expect(result).toBe(path.resolve("/some/project", ".wrangler/state"));
		});
	});

	describe("when persistence path is explicitly specified", () => {
		it("should resolve relative path from cwd", ({ expect }) => {
			const result = getLocalPersistencePath("./custom-persist", makeConfig());
			expect(result).toBe(path.resolve(process.cwd(), "./custom-persist"));
		});

		it("should resolve absolute path from cwd", ({ expect }) => {
			const absolutePath = "/absolute/persist/path";
			const result = getLocalPersistencePath(absolutePath, makeConfig());
			expect(result).toBe(path.resolve(process.cwd(), absolutePath));
		});

		it("should resolve relative path from cwd even when config path is set", ({
			expect,
		}) => {
			// When a custom persistTo is specified, it's always relative to cwd, not config path
			const configPath = "/some/project/wrangler.json";
			const result = getLocalPersistencePath(
				"./custom-persist",
				makeConfig(configPath)
			);
			expect(result).toBe(path.resolve(process.cwd(), "./custom-persist"));
		});
	});
});
