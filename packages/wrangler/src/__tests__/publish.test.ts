import * as fs from "node:fs";
import * as path from "node:path";
import type { KVNamespaceInfo } from "../kv";
import { mockKeyListRequest } from "./kv.test";
import { setMockResponse, unsetAllMocks } from "./mock-cfetch";
import { runInTempDir } from "./run-in-tmp";
import { runWrangler } from "./run-wrangler";
import { mockLogger } from "./mock-logger";
import type { Config } from "../config";
import * as TOML from "@iarna/toml";

describe("publish", () => {
  runInTempDir();
  const std = mockLogger();

  afterEach(() => {
    unsetAllMocks();
  });

  describe("entry-points", () => {
    it("should be able to use `index` with no extension as the entry-point", async () => {
      writeWranglerToml();
      writeEsmWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();

      await runWrangler("publish ./index");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should be able to use the `build.upload.main` config as the entry-point for ESM sources", async () => {
      writeWranglerToml({ build: { upload: { main: "./index.js" } } });
      writeEsmWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();

      await runWrangler("publish");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should be able to transpile TypeScript", async () => {
      writeWranglerToml();
      writeEsmWorkerSource({ format: "ts" });
      mockUploadWorkerRequest({ expectedBody: "var foo = 100;" });
      mockSubDomainRequest();
      await runWrangler("publish index.ts");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should be able to transpile entry-points in sub-directories", async () => {
      writeWranglerToml();
      writeEsmWorkerSource({ basePath: "./src" });
      mockUploadWorkerRequest({ expectedBody: "var foo = 100;" });
      mockSubDomainRequest();

      await runWrangler("publish ./src/index.js");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it('should error if a site definition doesn\'t have a "bucket" field', async () => {
      writeWranglerToml({
        // @ts-expect-error we're purposely missing the required `site.bucket` field
        site: {
          "entry-point": "./index.js",
        },
      });
      writeEsmWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      let error: Error | undefined;
      try {
        await runWrangler("publish ./index.js");
      } catch (e) {
        error = e;
      }

      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "A [site] definition requires a \`bucket\` field with a path to the site's public directory.

        [32m%s[0m
        If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(std.warn).toMatchInlineSnapshot(`
        "Deprecation notice: The \`site.entry-point\` config field is no longer used.
        The entry-point should be specified via the command line (e.g. \`wrangler publish path/to/script\`) or the \`build.upload.main\` config field.
        Please remove the \`site.entry-point\` field from the \`wrangler.toml\` file."
      `);
      expect(error).toMatchInlineSnapshot(
        `[AssertionError: A [site] definition requires a \`bucket\` field with a path to the site's public directory.]`
      );
    });

    it("should warn if there is a `site.entry-point` configuration", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };

      writeWranglerToml({
        site: {
          "entry-point": "./index.js",
          bucket: "assets",
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      mockUploadAssetsToKVRequest(kvNamespace.id, assets);

      await runWrangler("publish ./index.js");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        reading assets/file-2.txt...
        uploading as assets/file-2.5938485188.txt...
        Uploaded
        test-name
        (TIMINGS)
        Deployed
        test-name
        (TIMINGS)
         
        test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`
        "Deprecation notice: The \`site.entry-point\` config field is no longer used.
        The entry-point should be specified via the command line (e.g. \`wrangler publish path/to/script\`) or the \`build.upload.main\` config field.
        Please remove the \`site.entry-point\` field from the \`wrangler.toml\` file."
      `);
    });

    it("should error if there is no entry-point specified", async () => {
      writeWranglerToml();
      writeEsmWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      let error: Error | undefined;
      try {
        await runWrangler("publish");
      } catch (e) {
        error = e;
      }

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler publish path/to/script\`) or the \`build.upload.main\` config field.

        [32m%s[0m
        If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(error).toMatchInlineSnapshot(
        `[Error: Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler publish path/to/script\`) or the \`build.upload.main\` config field.]`
      );
    });
  });

  describe("asset upload", () => {
    it("should upload all the files in the directory specified by `config.site.bucket`", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      mockUploadAssetsToKVRequest(kvNamespace.id, assets);
      await runWrangler("publish");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        reading assets/file-2.txt...
        uploading as assets/file-2.5938485188.txt...
        Uploaded
        test-name
        (TIMINGS)
        Deployed
        test-name
        (TIMINGS)
         
        test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should only upload files that are not already in the KV namespace", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      // Put file-1 in the KV namespace
      mockKeyListRequest(kvNamespace.id, ["assets/file-1.2ca234f380.txt"]);
      // Check we do not upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath !== "assets/file-1.txt")
      );
      await runWrangler("publish");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        skipping - already uploaded
        reading assets/file-2.txt...
        uploading as assets/file-2.5938485188.txt...
        Uploaded
        test-name
        (TIMINGS)
        Deployed
        test-name
        (TIMINGS)
         
        test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should only upload files that match the `site-include` arg", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "assets/file-1.txt")
      );
      await runWrangler("publish --site-include file-1.txt");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "reading assets/file-1.txt...
              uploading as assets/file-1.2ca234f380.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should not upload files that match the `site-exclude` arg", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "assets/file-1.txt")
      );
      await runWrangler("publish --site-exclude file-2.txt");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "reading assets/file-1.txt...
              uploading as assets/file-1.2ca234f380.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should only upload files that match the `site.include` config", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
          include: ["file-1.txt"],
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "assets/file-1.txt")
      );
      await runWrangler("publish");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "reading assets/file-1.txt...
              uploading as assets/file-1.2ca234f380.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should not upload files that match the `site.exclude` config", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
          exclude: ["file-2.txt"],
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "assets/file-1.txt")
      );
      await runWrangler("publish");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "reading assets/file-1.txt...
              uploading as assets/file-1.2ca234f380.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use `site-include` arg over `site.include` config", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
          include: ["file-2.txt"],
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath === "assets/file-1.txt")
      );
      await runWrangler("publish --site-include file-1.txt");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "reading assets/file-1.txt...
              uploading as assets/file-1.2ca234f380.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use `site-exclude` arg over `site.exclude` config", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
          exclude: ["assets/file-1.txt"],
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Check we only upload file-1
      mockUploadAssetsToKVRequest(
        kvNamespace.id,
        assets.filter((a) => a.filePath.endsWith("assets/file-1.txt"))
      );
      await runWrangler("publish --site-exclude file-2.txt");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
              "reading assets/file-1.txt...
              uploading as assets/file-1.2ca234f380.txt...
              Uploaded
              test-name
              (TIMINGS)
              Deployed
              test-name
              (TIMINGS)
               
              test-name.test-sub-domain.workers.dev"
          `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should walk directories except node_modules", async () => {
      const assets = [
        {
          filePath: "assets/directory-1/file-1.txt",
          content: "Content of file-1",
        },
        {
          filePath: "assets/node_modules/file-2.txt",
          content: "Content of file-2",
        },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Only expect file-1 to be uploaded
      mockUploadAssetsToKVRequest(kvNamespace.id, assets.slice(0, 1));
      await runWrangler("publish");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
        "reading assets/directory-1/file-1.txt...
        uploading as assets/directory-1/file-1.2ca234f380.txt...
        Uploaded
        test-name
        (TIMINGS)
        Deployed
        test-name
        (TIMINGS)
         
        test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should skip hidden files and directories except `.well-known`", async () => {
      const assets = [
        {
          filePath: "assets/.hidden-file.txt",
          content: "Content of hidden-file",
        },
        {
          filePath: "assets/.hidden/file-1.txt",
          content: "Content of file-1",
        },
        {
          filePath: "assets/.well-known/file-2.txt",
          content: "Content of file-2",
        },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Only expect file-2 to be uploaded
      mockUploadAssetsToKVRequest(kvNamespace.id, assets.slice(2));
      await runWrangler("publish");

      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
        "reading assets/.well-known/file-2.txt...
        uploading as assets/.well-known/file-2.5938485188.txt...
        Uploaded
        test-name
        (TIMINGS)
        Deployed
        test-name
        (TIMINGS)
         
        test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should error if the asset is over 25Mb", async () => {
      const assets = [
        {
          filePath: "assets/large-file.txt",
          // This file is greater than 25MiB when base64 encoded but small enough to be uploaded.
          content: "X".repeat(25 * 1024 * 1024 * 0.8 + 1),
        },
        {
          filePath: "assets/too-large-file.txt",
          content: "X".repeat(25 * 1024 * 1024 + 1),
        },
      ];
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
          exclude: ["assets/file-1.txt"],
        },
      });
      writeEsmWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);

      let error: Error | undefined;
      try {
        await runWrangler("publish");
      } catch (e) {
        error = e;
      }
      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/large-file.txt...
        uploading as assets/large-file.0ea0637a45.txt..."
      `);
      expect(std.err).toMatchInlineSnapshot(`
        "File assets/too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits

        [32m%s[0m
        If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(error).toMatchInlineSnapshot(
        `[Error: File assets/too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits]`
      );
    });

    it("should error if the asset key is over 512 characters", async () => {
      const longFilePathAsset = {
        filePath: "assets/" + "folder/".repeat(100) + "file.txt",
        content: "content of file",
      };
      const kvNamespace = {
        title: "__test-name_sites_assets",
        id: "__test-name_sites_assets-id",
      };
      writeWranglerToml({
        build: { upload: { main: "./index.js" } },
        site: {
          bucket: "assets",
        },
      });
      writeEsmWorkerSource();
      writeAssets([longFilePathAsset]);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);

      let error: Error | undefined;
      try {
        await runWrangler("publish");
      } catch (e) {
        error = e;
      }

      expect(std.out).toMatchInlineSnapshot(
        `"reading assets/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.txt..."`
      );
      expect(std.err).toMatchInlineSnapshot(`
        "The asset path key \\"assets/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.3da0d0cd12.txt\\" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits\\",

        [32m%s[0m
        If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(error).toMatchInlineSnapshot(
        `[Error: The asset path key "assets/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.3da0d0cd12.txt" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits",]`
      );
    });
  });

  describe("custom builds", () => {
    it("should run a custom build before publishing", async () => {
      writeWranglerToml({
        build: {
          command: `echo "custom build" && echo "export default { fetch(){ return new Response(123)} }" > index.js`,
        },
      });

      mockUploadWorkerRequest({
        expectedBody: "return new Response(123)",
      });
      mockSubDomainRequest();

      await runWrangler("publish index.js");
      expect(stripTimings(std.out)).toMatchInlineSnapshot(`
        "running:
        echo \\"custom build\\" && echo \\"export default { fetch(){ return new Response(123)} }\\" > index.js
        Uploaded
        test-name
        (TIMINGS)
        Deployed
        test-name
        (TIMINGS)
         
        test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });
  });
});

/** Write a mock wrangler.toml file to disk. */
function writeWranglerToml(config: Omit<Config, "env"> = {}) {
  // We Omit `env` from config because TOML.stringify() appears to
  // have a weird type signature that appears to fail. We'll revisit this
  // when we write tests for publishing environments
  fs.writeFileSync(
    "./wrangler.toml",
    TOML.stringify({
      compatibility_date: "2022-01-12",
      name: "test-name",
      ...config,
    }),

    "utf-8"
  );
}

/** Write a mock Worker script to disk. */
function writeEsmWorkerSource({
  basePath = ".",
  format = "js",
}: { basePath?: string; format?: "js" | "ts" | "jsx" | "tsx" | "mjs" } = {}) {
  if (basePath !== ".") {
    fs.mkdirSync(basePath, { recursive: true });
  }
  fs.writeFileSync(
    `${basePath}/index.${format}`,
    [
      `import { foo } from "./another";`,
      `export default {`,
      `  async fetch(request) {`,
      `    return new Response('Hello' + foo);`,
      `  },`,
      `};`,
    ].join("\n")
  );
  fs.writeFileSync(`${basePath}/another.${format}`, `export const foo = 100;`);
}

/** Write mock assets to the file system so they can be uploaded. */
function writeAssets(assets: { filePath: string; content: string }[]) {
  for (const asset of assets) {
    fs.mkdirSync(path.dirname(asset.filePath), { recursive: true });
    fs.writeFileSync(asset.filePath, asset.content);
  }
}

/** Create a mock handler for the request to upload a worker script. */
function mockUploadWorkerRequest({
  available_on_subdomain = true,
  expectedBody,
}: {
  available_on_subdomain?: boolean;
  expectedBody?: string;
} = {}) {
  setMockResponse(
    "/accounts/:accountId/workers/scripts/:scriptName",
    "PUT",
    async ([_url, accountId, scriptName], { body }, queryParams) => {
      expect(accountId).toEqual("some-account-id");
      expect(scriptName).toEqual("test-name");
      expect(queryParams.get("available_on_subdomains")).toEqual("true");
      if (expectedBody !== undefined) {
        expect(
          await ((body as FormData).get("index.js") as File).text()
        ).toMatch(expectedBody);
      }
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
