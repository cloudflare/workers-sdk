import * as fs from "node:fs";
import * as path from "node:path";
import type { KVNamespaceInfo } from "../kv";
import { mockKeyListRequest } from "./kv.test";
import { setMockResponse, unsetAllMocks } from "./mock-cfetch";
import { runInTempDir } from "./run-in-tmp";
import { runWrangler } from "./run-wrangler";

describe("publish", () => {
  runInTempDir();

  afterEach(() => {
    unsetAllMocks();
  });

  describe("entry-points", () => {
    it("should be able to use `index` with no extension as the entry-point", async () => {
      writeWranglerToml();
      writeEsmWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();

      const { stdout, stderr, error } = await runWrangler("publish ./index");

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
              "Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });

    it("should be able to use the `build.upload.main` config as the entry-point for ESM sources", async () => {
      writeWranglerToml("./index.js");
      writeEsmWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();

      const { stdout, stderr, error } = await runWrangler("publish");

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
              "Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });
  });

  describe("asset upload", () => {
    it("should upload all the files in the directory specified by `config.site.bucket`", async () => {
      const assets = [
        { filePath: "file-1.txt", content: "Content of file-1" },
        { filePath: "file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml("./index.js", "./assets");
      writeEsmWorkerSource();
      writeAssets("./assets", assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      mockUploadAssetsToKVRequest(kvNamespace.id, assets);
      const { stdout, stderr, error } = await runWrangler("publish");

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
        "uploading assets/file-1.txt...
        uploading assets/file-2.txt...
        Uploaded
        test-name
        (TIMINGS)
        Deployed
        test-name
        (TIMINGS)
         
        test-name.test-sub-domain.workers.dev"
      `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });

    it("should only upload files that are not already in the KV namespace", async () => {
      const assets = [
        { filePath: "file-1.txt", content: "Content of file-1" },
        { filePath: "file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml("./index.js", "./assets");
      writeEsmWorkerSource();
      writeAssets("./assets", assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      // Put file-1 in the KV namespace
      mockKeyListRequest(kvNamespace.id, [
        "file-1.c514defbb343fb04ad55183d8336ae0a5988616b.txt",
      ]);
      // Check we do not upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath !== "file-1.txt")
      );
      const { stdout, stderr, error } = await runWrangler("publish");

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
              "uploading assets/file-2.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });

    it("should only upload files that match the `site-include` arg", async () => {
      const assets = [
        { filePath: "file-1.txt", content: "Content of file-1" },
        { filePath: "file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml("./index.js", "./assets");
      writeEsmWorkerSource();
      writeAssets("./assets", assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "file-1.txt")
      );
      const { stdout, stderr, error } = await runWrangler(
        "publish --site-include file-1.txt"
      );

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
              "uploading assets/file-1.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });

    it("should not upload files that match the `site-exclude` arg", async () => {
      const assets = [
        { filePath: "file-1.txt", content: "Content of file-1" },
        { filePath: "file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml("./index.js", "./assets");
      writeEsmWorkerSource();
      writeAssets("./assets", assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "file-1.txt")
      );
      const { stdout, stderr, error } = await runWrangler(
        "publish --site-exclude file-2.txt"
      );

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
              "uploading assets/file-1.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });

    it("should only upload files that match the `site.include` config", async () => {
      const assets = [
        { filePath: "file-1.txt", content: "Content of file-1" },
        { filePath: "file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml("./index.js", "./assets", ["file-1.txt"]);
      writeEsmWorkerSource();
      writeAssets("./assets", assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "file-1.txt")
      );
      const { stdout, stderr, error } = await runWrangler("publish");

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
              "uploading assets/file-1.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });

    it("should not upload files that match the `site.exclude` config", async () => {
      const assets = [
        { filePath: "file-1.txt", content: "Content of file-1" },
        { filePath: "file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml("./index.js", "./assets", undefined, ["file-2.txt"]);
      writeEsmWorkerSource();
      writeAssets("./assets", assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "file-1.txt")
      );
      const { stdout, stderr, error } = await runWrangler("publish");

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
              "uploading assets/file-1.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });

    it("should use `site-include` arg over `site.include` config", async () => {
      const assets = [
        { filePath: "file-1.txt", content: "Content of file-1" },
        { filePath: "file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml("./index.js", "./assets", ["file-2.txt"]);
      writeEsmWorkerSource();
      writeAssets("./assets", assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "file-1.txt")
      );
      const { stdout, stderr, error } = await runWrangler(
        "publish --site-include file-1.txt"
      );

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
              "uploading assets/file-1.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });

    it("should use `site-exclude` arg over `site.exclude` config", async () => {
      const assets = [
        { filePath: "file-1.txt", content: "Content of file-1" },
        { filePath: "file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml("./index.js", "./assets", undefined, ["file-1.txt"]);
      writeEsmWorkerSource();
      writeAssets("./assets", assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "file-1.txt")
      );
      const { stdout, stderr, error } = await runWrangler(
        "publish --site-exclude file-2.txt"
      );

      expect(stripTimings(stdout)).toMatchInlineSnapshot(`
              "uploading assets/file-1.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(stderr).toMatchInlineSnapshot(`""`);
      expect(error).toMatchInlineSnapshot(`undefined`);
    });

    it("should error if the asset is over 25Mb", async () => {
      const assets = [
        {
          filePath: "large-file.txt",
          // This file is greater than 25MiB when base64 encoded but small enough to be uploaded.
          content: "X".repeat(25 * 1024 * 1024 * 0.8 + 1),
        },
        {
          filePath: "too-large-file.txt",
          content: "X".repeat(25 * 1024 * 1024 + 1),
        },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml("./index.js", "./assets", undefined, ["file-1.txt"]);
      writeEsmWorkerSource();
      writeAssets("./assets", assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);

      const { stdout, stderr, error } = await runWrangler("publish");

      expect(stdout).toMatchInlineSnapshot(
        `"uploading assets/large-file.txt..."`
      );
      expect(stderr).toMatchInlineSnapshot(`
        "File assets/too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits

        [32m%s[0m
        If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(error).toMatchInlineSnapshot(
        `[Error: File assets/too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits]`
      );
    });
  });
});

/** Write a mock wrangler.toml file to disk. */
function writeWranglerToml(
  main?: string,
  bucket?: string,
  include?: string[],
  exclude?: string[]
) {
  fs.writeFileSync(
    "./wrangler.toml",
    [
      `compatibility_date = "2022-01-12"`,
      `name = "test-name"`,
      main !== undefined ? `[build.upload]\nmain = "${main}"` : "",
      bucket || include || exclude ? "[site]" : "",
      bucket !== undefined ? `bucket = "${bucket}"` : "",
      include !== undefined ? `include = ${JSON.stringify(include)}` : "",
      exclude !== undefined ? `exclude = ${JSON.stringify(exclude)}` : "",
    ].join("\n"),
    "utf-8"
  );
}

/** Write a mock Worker script to disk. */
function writeEsmWorkerSource() {
  fs.writeFileSync(
    "index.js",
    [
      `import { foo } from "./another";`,
      `export default {`,
      `  async fetch(request) {`,
      `    return new Response('Hello' + foo);`,
      `  },`,
      `};`,
    ].join("\n")
  );
  fs.writeFileSync("another.js", `export const foo = 100;`);
}

/** Write mock assets to the file system so they can be uploaded. */
function writeAssets(
  assetDir: string,
  assets: { filePath: string; content: string }[]
) {
  for (const asset of assets) {
    const filePath = path.join(assetDir, asset.filePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, asset.content);
  }
}

/** Create a mock handler for the request to upload a worker script. */
function mockUploadWorkerRequest(available_on_subdomain = true) {
  setMockResponse(
    "/accounts/:accountId/workers/scripts/:scriptName",
    "PUT",
    ([_url, accountId, scriptName], _init, queryParams) => {
      expect(accountId).toEqual("some-account-id");
      expect(scriptName).toEqual("test-name");
      expect(queryParams.get("available_on_subdomains")).toEqual("true");
      return { available_on_subdomain };
    }
  );
}

/** Create a mock handler for the request to get the account's subdomain. */
function mockSubDomainRequest(subdomain = "test-sub-domain") {
  setMockResponse("/accounts/:accountId/workers/subdomain", () => {
    return { subdomain };
  });
}

/** Create a mock handler for the request to get a list of all KV namespaces. */
function mockListKVNamespacesRequest(...namespaces: KVNamespaceInfo[]) {
  setMockResponse(
    "/accounts/:accountId/storage/kv/namespaces",
    "GET",
    ([_url, accountId]) => {
      expect(accountId).toEqual("some-account-id");
      return namespaces;
    }
  );
}

/** Create a mock handler for the request that tries to do a bulk upload of assets to a KV namespace. */
function mockUploadAssetsToKVRequest(
  expectedNamespaceId: string,
  assets: { filePath: string; content: string }[]
) {
  setMockResponse(
    "/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
    "PUT",
    ([_url, accountId, namespaceId], { body }) => {
      expect(accountId).toEqual("some-account-id");
      expect(namespaceId).toEqual(expectedNamespaceId);
      const uploads = JSON.parse(body as string);
      expect(assets.length).toEqual(uploads.length);
      for (let i = 0; i < uploads.length; i++) {
        const asset = assets[i];
        const upload = uploads[i];
        // The asset key consists of:
        // - the basename of the filepath
        // - some hash value
        // - the extension
        const keyMatcher = new RegExp(
          "^" +
            asset.filePath
              .replace(/(\.[^.]+)$/, ".[a-z0-9]+$1")
              .replace(/\./g, "\\.")
        );
        expect(upload.key).toMatch(keyMatcher);
        // The asset value is base64 encoded.
        expect(upload.base64).toBe(true);
        expect(Buffer.from(upload.value, "base64").toString()).toEqual(
          asset.content
        );
      }
      return null;
    }
  );
}

/** Strip timing data out of the stdout, since this is not always deterministic. */
function stripTimings(stdout: string): string {
  return stdout.replace(/\(\d+\.\d+ sec\)/g, "(TIMINGS)");
}
