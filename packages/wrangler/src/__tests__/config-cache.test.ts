import { getConfigCache, saveToConfigCache } from "../config-cache";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("config cache", () => {
  runInTempDir();

  const pagesConfigCacheFilename = "pages-config-cache.json";

  it("should return an empty config if no file exists", () => {
    expect(getConfigCache(pagesConfigCacheFilename)).toMatchInlineSnapshot(
      `Object {}`
    );
  });

  it("should read and write values without overriding old ones", () => {
    saveToConfigCache(pagesConfigCacheFilename, {
      account_id: "some-account-id",
      pages_project_name: "foo",
    });
    expect(getConfigCache(pagesConfigCacheFilename).account_id).toEqual(
      "some-account-id"
    );

    saveToConfigCache(pagesConfigCacheFilename, {
      pages_project_name: "bar",
    });
    expect(getConfigCache(pagesConfigCacheFilename).account_id).toEqual(
      "some-account-id"
    );
  });
});
