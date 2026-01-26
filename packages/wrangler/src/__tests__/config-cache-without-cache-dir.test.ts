import { describe, expect, it } from "vitest";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

interface PagesConfigCache {
	account_id: string;
	pages_project_name: string;
}

describe("config cache without node_modules", () => {
	// Use a controlled homedir so the global cache fallback works in a predictable location
	runInTempDir({ homedir: "home", disableCaching: false });
	mockConsoleMethods();
	// In this set of tests, we don't create a node_modules folder,
	// so the cache should fall back to the global wrangler config directory
	const pagesConfigCacheFilename = "pages-config-cache.json";

	it("should return an empty config if no file exists", () => {
		expect(
			getConfigCache<PagesConfigCache>(pagesConfigCacheFilename)
		).toMatchInlineSnapshot(`Object {}`);
	});

	it("should fall back to global cache when no node_modules exists", () => {
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
		// Should preserve existing values when adding new ones
		expect(
			getConfigCache<PagesConfigCache>(pagesConfigCacheFilename).account_id
		).toEqual("some-account-id");
		expect(
			getConfigCache<PagesConfigCache>(pagesConfigCacheFilename)
				.pages_project_name
		).toEqual("bar");
	});
});
