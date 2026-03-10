import * as path from "node:path";
import { describe, it } from "vitest";
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

describe("config cache with .wrangler/cache fallback", () => {
	runInTempDir();
	mockConsoleMethods();
	// In this set of tests, we don't create a node_modules folder
	// so getCacheFolder() should fall back to .wrangler/cache
	const pagesConfigCacheFilename = "pages-config-cache.json";

	it("should use .wrangler/cache when no node_modules exists", ({ expect }) => {
		const cacheFolder = getCacheFolder();
		expect(cacheFolder).toBe(path.join(process.cwd(), ".wrangler", "cache"));
	});

	it("should return an empty config if no file exists", ({ expect }) => {
		expect(getConfigCache<PagesConfigCache>(pagesConfigCacheFilename)).toEqual(
			{}
		);
	});

	it("should save and retrieve config values using .wrangler/cache fallback", ({
		expect,
	}) => {
		saveToConfigCache<PagesConfigCache>(pagesConfigCacheFilename, {
			account_id: "some-account-id",
			pages_project_name: "foo",
		});
		expect(getConfigCache<PagesConfigCache>(pagesConfigCacheFilename)).toEqual({
			account_id: "some-account-id",
			pages_project_name: "foo",
		});

		saveToConfigCache<PagesConfigCache>(pagesConfigCacheFilename, {
			pages_project_name: "bar",
		});
		expect(getConfigCache<PagesConfigCache>(pagesConfigCacheFilename)).toEqual({
			account_id: "some-account-id",
			pages_project_name: "bar",
		});
	});
});
