import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "vitest";
import {
	NonDirectoryAssetsDirError,
	NonExistentAssetsDirError,
	getAssetsOptions,
} from "../assets";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Creates a minimal Config object sufficient for `getAssetsOptions`.
 * Only the fields actually read by the function need to be populated.
 */
function makeConfig(
	overrides: Partial<{
		assets: { directory?: string; binding?: string };
		main: string;
		configPath: string;
	}> = {}
): Config {
	return {
		assets: undefined,
		main: undefined,
		configPath: undefined,
		compatibility_date: "2024-01-01",
		compatibility_flags: [],
		...overrides,
	} as unknown as Config;
}

describe("getAssetsOptions", () => {
	runInTempDir();

	describe("validateDirectoryExistence: true (default — deploy path)", () => {
		it("throws NonExistentAssetsDirError when the --assets directory does not exist", ({
			expect,
		}) => {
			expect(() =>
				getAssetsOptions({
					args: { assets: "dist" },
					config: makeConfig(),
					validateDirectoryExistence: true,
				})
			).toThrow(NonExistentAssetsDirError);
		});

		it("throws with a message referencing the CLI flag when --assets is used", ({
			expect,
		}) => {
			expect(() =>
				getAssetsOptions({
					args: { assets: "dist" },
					config: makeConfig(),
					validateDirectoryExistence: true,
				})
			).toThrow(
				/The directory specified by the "--assets" command line argument does not exist/
			);
		});

		it("throws with a message referencing the config file when assets.directory is used", ({
			expect,
		}) => {
			expect(() =>
				getAssetsOptions({
					args: { assets: undefined },
					config: makeConfig({ assets: { directory: "dist" } }),
					validateDirectoryExistence: true,
				})
			).toThrow(
				/The directory specified by the "assets.directory" field in your configuration file does not exist/
			);
		});

		it("throws NonDirectoryAssetsDirError when the path points to a file, not a directory", ({
			expect,
		}) => {
			fs.writeFileSync("not-a-dir.txt", "");
			expect(() =>
				getAssetsOptions({
					args: { assets: "not-a-dir.txt" },
					config: makeConfig(),
					validateDirectoryExistence: true,
				})
			).toThrow(NonDirectoryAssetsDirError);
		});
	});

	describe("validateDirectoryExistence: false (getPlatformProxy / unstable_getMiniflareWorkerOptions path)", () => {
		it("does NOT throw when the assets directory does not exist", ({
			expect,
		}) => {
			expect(() =>
				getAssetsOptions({
					args: { assets: "dist" },
					config: makeConfig(),
					validateDirectoryExistence: false,
				})
			).not.toThrow();
		});

		it("returns a valid AssetsOptions object even when the directory is absent", ({
			expect,
		}) => {
			const result = getAssetsOptions({
				args: { assets: "dist" },
				config: makeConfig(),
				validateDirectoryExistence: false,
			});

			expect(result).toBeDefined();
			expect(result?.directory).toBe(path.resolve(process.cwd(), "dist"));
			// No _redirects / _headers since the directory doesn't exist
			expect(result?._redirects).toBeUndefined();
			expect(result?._headers).toBeUndefined();
		});

		it("still throws NonDirectoryAssetsDirError when the path points to a file", ({
			expect,
		}) => {
			fs.writeFileSync("not-a-dir.txt", "");
			expect(() =>
				getAssetsOptions({
					args: { assets: "not-a-dir.txt" },
					config: makeConfig(),
					validateDirectoryExistence: false,
				})
			).toThrow(NonDirectoryAssetsDirError);
		});

		it("returns correct options when the directory exists and has files", ({
			expect,
		}) => {
			fs.mkdirSync("dist");
			fs.writeFileSync(path.join("dist", "_redirects"), "/old /new 301");

			const result = getAssetsOptions({
				args: { assets: "dist" },
				config: makeConfig(),
				validateDirectoryExistence: false,
			});

			expect(result?.directory).toBe(path.resolve(process.cwd(), "dist"));
			expect(result?._redirects).toContain("/old /new 301");
		});

		it("works with assets from config rather than the CLI flag", ({
			expect,
		}) => {
			const result = getAssetsOptions({
				args: { assets: undefined },
				config: makeConfig({ assets: { directory: "nonexistent-dir" } }),
				validateDirectoryExistence: false,
			});

			expect(result).toBeDefined();
			expect(result?.directory).toContain("nonexistent-dir");
		});

		it("returns undefined when no assets are configured", ({ expect }) => {
			const result = getAssetsOptions({
				args: { assets: undefined },
				config: makeConfig(),
				validateDirectoryExistence: false,
			});

			expect(result).toBeUndefined();
		});
	});
});
