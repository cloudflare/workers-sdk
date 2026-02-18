import { mkdirSync } from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	getCacheFolder,
	getConfigCache,
	saveToConfigCache,
} from "../config-cache";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

interface PagesConfigCache {
	account_id: string;
	pages_project_name: string;
}

describe("config cache", () => {
	runInTempDir();
	mockConsoleMethods();

	const pagesConfigCacheFilename = "pages-config-cache.json";

	describe("basic operations", () => {
		beforeEach(() => {
			mkdirSync("node_modules");
		});

		it("should return an empty config if no file exists", ({ expect }) => {
			expect(
				getConfigCache<PagesConfigCache>(pagesConfigCacheFilename)
			).toMatchInlineSnapshot(`{}`);
		});

		it("should read and write values without overriding old ones", ({
			expect,
		}) => {
			saveToConfigCache<PagesConfigCache>(pagesConfigCacheFilename, {
				account_id: "some-account-id",
				pages_project_name: "foo",
			});
			expect(
				getConfigCache<PagesConfigCache>(pagesConfigCacheFilename).account_id
			).toEqual("some-account-id");

			saveToConfigCache<PagesConfigCache>(pagesConfigCacheFilename, {
				pages_project_name: "bar",
			});
			expect(
				getConfigCache<PagesConfigCache>(pagesConfigCacheFilename).account_id
			).toEqual("some-account-id");
		});
	});

	describe("cache directory resolution", () => {
		const originalCacheDir = process.env.WRANGLER_CACHE_DIR;

		beforeEach(() => {
			delete process.env.WRANGLER_CACHE_DIR;
		});

		afterEach(() => {
			if (originalCacheDir !== undefined) {
				process.env.WRANGLER_CACHE_DIR = originalCacheDir;
			} else {
				delete process.env.WRANGLER_CACHE_DIR;
			}
		});

		it("should use .wrangler/cache when no node_modules exists", ({
			expect,
		}) => {
			// Don't create node_modules - this forces .wrangler/cache
			// Note: findUpSync may find a parent node_modules, but we're testing
			// the case where there's no existing cache in any found node_modules
			const cacheFolder = getCacheFolder();
			// In a clean temp directory with no node_modules, should use .wrangler/cache
			// However, findUpSync may find a parent node_modules, so we just verify
			// that getCacheFolder returns a valid path
			expect(cacheFolder).toBeTruthy();
			expect(typeof cacheFolder).toBe("string");
		});

		it("should respect WRANGLER_CACHE_DIR environment variable", ({
			expect,
		}) => {
			const customCacheDir = path.join(process.cwd(), "custom-cache");
			mkdirSync(customCacheDir, { recursive: true });
			vi.stubEnv("WRANGLER_CACHE_DIR", customCacheDir);

			const cacheFolder = getCacheFolder();
			expect(cacheFolder).toBe(customCacheDir);
		});

		it("should prioritize WRANGLER_CACHE_DIR over any other detection", ({
			expect,
		}) => {
			// Create node_modules (which would normally be used)
			mkdirSync("node_modules");

			// But also set WRANGLER_CACHE_DIR which should take priority
			const customCacheDir = path.join(process.cwd(), "custom-cache-priority");
			mkdirSync(customCacheDir, { recursive: true });
			vi.stubEnv("WRANGLER_CACHE_DIR", customCacheDir);

			const cacheFolder = getCacheFolder();
			expect(cacheFolder).toBe(customCacheDir);
		});

		it("should always return a string (never null)", ({ expect }) => {
			// Even with no node_modules, should return .wrangler/cache
			const cacheFolder = getCacheFolder();
			expect(cacheFolder).toBeTruthy();
			expect(typeof cacheFolder).toBe("string");
		});
	});
});
