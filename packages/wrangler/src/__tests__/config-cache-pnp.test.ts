import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

interface PagesConfigCache {
	account_id: string;
	pages_project_name: string;
}

describe("config cache with Yarn PnP", () => {
	runInTempDir();
	mockConsoleMethods();

	const originalCacheDir = process.env.WRANGLER_CACHE_DIR;

	beforeEach(() => {
		delete process.env.WRANGLER_CACHE_DIR;
		vi.resetModules();
	});

	afterEach(() => {
		if (originalCacheDir !== undefined) {
			process.env.WRANGLER_CACHE_DIR = originalCacheDir;
		} else {
			delete process.env.WRANGLER_CACHE_DIR;
		}
	});

	const pagesConfigCacheFilename = "pages-config-cache.json";

	it("should use .wrangler/cache when .pnp.cjs exists", async ({ expect }) => {
		// Create .pnp.cjs file to simulate Yarn PnP
		writeFileSync(".pnp.cjs", "");

		const { getConfigCache, saveToConfigCache, purgeConfigCaches } =
			await import("../config-cache");

		// Ensure cache is reset
		purgeConfigCaches();

		saveToConfigCache<PagesConfigCache>(pagesConfigCacheFilename, {
			account_id: "pnp-account-id",
			pages_project_name: "pnp-project",
		});

		const cache = getConfigCache<PagesConfigCache>(pagesConfigCacheFilename);
		expect(cache.account_id).toEqual("pnp-account-id");
		expect(cache.pages_project_name).toEqual("pnp-project");
	});

	it("should use .wrangler/cache when .pnp.js exists", async ({ expect }) => {
		// Create .pnp.js file to simulate Yarn PnP (older version)
		writeFileSync(".pnp.js", "");

		const { getConfigCache, saveToConfigCache, purgeConfigCaches } =
			await import("../config-cache");

		// Ensure cache is reset
		purgeConfigCaches();

		saveToConfigCache<PagesConfigCache>(pagesConfigCacheFilename, {
			account_id: "pnp-js-account-id",
			pages_project_name: "pnp-js-project",
		});

		const cache = getConfigCache<PagesConfigCache>(pagesConfigCacheFilename);
		expect(cache.account_id).toEqual("pnp-js-account-id");
	});

	it("should respect WRANGLER_CACHE_DIR environment variable", async ({
		expect,
	}) => {
		const customCacheDir = path.join(process.cwd(), "custom-cache");
		mkdirSync(customCacheDir, { recursive: true });
		process.env.WRANGLER_CACHE_DIR = customCacheDir;

		const { getConfigCache, saveToConfigCache, purgeConfigCaches } =
			await import("../config-cache");

		// Ensure cache is reset
		purgeConfigCaches();

		saveToConfigCache<PagesConfigCache>(pagesConfigCacheFilename, {
			account_id: "env-cache-account-id",
			pages_project_name: "env-cache-project",
		});

		const cache = getConfigCache<PagesConfigCache>(pagesConfigCacheFilename);
		expect(cache.account_id).toEqual("env-cache-account-id");
	});

	it("should prioritize WRANGLER_CACHE_DIR over PnP detection", async ({
		expect,
	}) => {
		// Create .pnp.cjs file
		writeFileSync(".pnp.cjs", "");

		// But also set WRANGLER_CACHE_DIR
		const customCacheDir = path.join(process.cwd(), "custom-cache-priority");
		mkdirSync(customCacheDir, { recursive: true });
		process.env.WRANGLER_CACHE_DIR = customCacheDir;

		const { getConfigCache, saveToConfigCache, purgeConfigCaches } =
			await import("../config-cache");

		// Ensure cache is reset
		purgeConfigCaches();

		saveToConfigCache<PagesConfigCache>(pagesConfigCacheFilename, {
			account_id: "priority-account-id",
			pages_project_name: "priority-project",
		});

		const cache = getConfigCache<PagesConfigCache>(pagesConfigCacheFilename);
		expect(cache.account_id).toEqual("priority-account-id");
	});
});
