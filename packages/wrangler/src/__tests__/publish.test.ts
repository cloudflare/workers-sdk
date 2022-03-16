import * as fs from "node:fs";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import {
  createFetchResult,
  setMockRawResponse,
  setMockResponse,
  unsetAllMocks,
} from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockKeyListRequest } from "./helpers/mock-kv";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";
import type { WorkerMetadata } from "../create-worker-upload-form";
import type { KVNamespaceInfo } from "../kv";
import type { FormData, File } from "undici";

describe("publish", () => {
  beforeEach(() => {
    // @ts-expect-error we're using a very simple setTimeout mock here
    jest.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
      fn();
    });
  });
  mockAccountId();
  mockApiToken();
  runInTempDir();
  const std = mockConsoleMethods();

  afterEach(() => {
    unsetAllMocks();
  });

  describe("environments", () => {
    it("should use legacy environments by default", async () => {
      writeWranglerToml();
      writeWorkerSource();
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        env: "some-env",
        legacyEnv: true,
      });
      await runWrangler("publish index.js --env some-env");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name-some-env (TIMINGS)
        Published test-name-some-env (TIMINGS)
          test-name-some-env.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    describe("legacy", () => {
      it("uses the script name when no environment is specified", async () => {
        writeWranglerToml();
        writeWorkerSource();
        mockSubDomainRequest();
        mockUploadWorkerRequest({
          legacyEnv: true,
        });
        await runWrangler("publish index.js --legacy-env true");
        expect(std.out).toMatchInlineSnapshot(`
          "Uploaded test-name (TIMINGS)
          Published test-name (TIMINGS)
            test-name.test-sub-domain.workers.dev"
        `);
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
      });

      it("appends the environment name when provided", async () => {
        writeWranglerToml();
        writeWorkerSource();
        mockSubDomainRequest();
        mockUploadWorkerRequest({
          env: "some-env",
          legacyEnv: true,
        });
        await runWrangler("publish index.js --env some-env --legacy-env true");
        expect(std.out).toMatchInlineSnapshot(`
          "Uploaded test-name-some-env (TIMINGS)
          Published test-name-some-env (TIMINGS)
            test-name-some-env.test-sub-domain.workers.dev"
        `);
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
      });
    });

    describe("services", () => {
      it("uses the script name when no environment is specified", async () => {
        writeWranglerToml();
        writeWorkerSource();
        mockSubDomainRequest();
        mockUploadWorkerRequest({
          legacyEnv: false,
        });
        await runWrangler("publish index.js");
        expect(std.out).toMatchInlineSnapshot(`
          "Uploaded test-name (TIMINGS)
          Published test-name (TIMINGS)
            test-name.test-sub-domain.workers.dev"
        `);
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
      });

      it("publishes as an environment when provided", async () => {
        writeWranglerToml();
        writeWorkerSource();
        mockSubDomainRequest();
        mockUploadWorkerRequest({
          env: "some-env",
          legacyEnv: false,
        });
        await runWrangler("publish index.js --env some-env --legacy-env false");
        expect(std.out).toMatchInlineSnapshot(`
          "Uploaded test-name (some-env) (TIMINGS)
          Published test-name (some-env) (TIMINGS)
            some-env.test-name.test-sub-domain.workers.dev"
        `);
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
      });
    });
  });

  it("should resolve wrangler.toml relative to the entrypoint", async () => {
    fs.mkdirSync("./some-path/worker", { recursive: true });
    fs.writeFileSync(
      "./some-path/wrangler.toml",
      TOML.stringify({
        name: "test-name",
        compatibility_date: "2022-01-12",
        vars: { xyz: 123 },
      }),
      "utf-8"
    );
    writeWorkerSource({ basePath: "./some-path/worker" });
    mockUploadWorkerRequest({
      expectedBindings: [
        {
          json: 123,
          name: "xyz",
          type: "json",
        },
      ],
      expectedCompatibilityDate: "2022-01-12",
    });
    mockSubDomainRequest();
    await runWrangler("publish ./some-path/worker/index.js");
    expect(std.out).toMatchInlineSnapshot(`
      "Uploaded test-name (TIMINGS)
      Published test-name (TIMINGS)
        test-name.test-sub-domain.workers.dev"
    `);
    expect(std.err).toMatchInlineSnapshot(`""`);
  });

  describe("routes", () => {
    it("should publish the worker to a route", async () => {
      writeWranglerToml({
        routes: ["example.com/some-route/*"],
      });
      writeWorkerSource();
      mockUpdateWorkerRequest({ enabled: false });
      mockUploadWorkerRequest({ expectedType: "esm" });
      mockPublishRoutesRequest({ routes: ["example.com/some-route/*"] });
      await runWrangler("publish ./index");
    });

    it("should publish to legacy environment specific routes", async () => {
      writeWranglerToml({
        routes: ["example.com/some-route/*"],
        env: {
          dev: {
            routes: ["dev-example.com/some-route/*"],
          },
        },
      });
      writeWorkerSource();
      mockUpdateWorkerRequest({ enabled: false, legacyEnv: true, env: "dev" });
      mockUploadWorkerRequest({
        expectedType: "esm",
        legacyEnv: true,
        env: "dev",
      });
      mockPublishRoutesRequest({
        routes: ["dev-example.com/some-route/*"],
        legacyEnv: true,
        env: "dev",
      });
      await runWrangler("publish ./index --env dev --legacy-env true");
    });

    it("services: should publish to service environment specific routes", async () => {
      writeWranglerToml({
        routes: ["example.com/some-route/*"],
        env: {
          dev: {
            routes: ["dev-example.com/some-route/*"],
          },
        },
      });
      writeWorkerSource();
      mockUpdateWorkerRequest({ enabled: false, env: "dev" });
      mockUploadWorkerRequest({
        expectedType: "esm",
        env: "dev",
      });
      mockPublishRoutesRequest({
        routes: ["dev-example.com/some-route/*"],
        env: "dev",
      });
      await runWrangler("publish ./index --env dev --legacy-env false");
    });

    it.todo("should error if it's a workers.dev route");
  });

  describe("entry-points", () => {
    it("should be able to use `index` with no extension as the entry-point (esm)", async () => {
      writeWranglerToml();
      writeWorkerSource();
      mockUploadWorkerRequest({ expectedType: "esm" });
      mockSubDomainRequest();

      await runWrangler("publish ./index");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should be able to use `index` with no extension as the entry-point (sw)", async () => {
      writeWranglerToml();
      writeWorkerSource({ type: "sw" });
      mockUploadWorkerRequest({ expectedType: "sw" });
      mockSubDomainRequest();

      await runWrangler("publish ./index");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should be able to use the `main` config as the entry-point for ESM sources", async () => {
      writeWranglerToml({ main: "./index.js" });
      writeWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();

      await runWrangler("publish");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use `main` relative to the wrangler.toml not cwd", async () => {
      writeWranglerToml({
        main: "./foo/index.js",
      });
      writeWorkerSource({ basePath: "foo" });
      mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
      mockSubDomainRequest();
      process.chdir("foo");
      await runWrangler("publish");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it('should use `build.upload.main` as an entry point, where `build.upload.dir` defaults to "./dist", and log a deprecation warning', async () => {
      writeWranglerToml({ build: { upload: { main: "./index.js" } } });
      writeWorkerSource({ basePath: "./dist" });
      mockUploadWorkerRequest();
      mockSubDomainRequest();

      await runWrangler("publish");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`
        "Processing wrangler.toml configuration:
          - DEPRECATION: \\"build.upload.main\\":
            Delete the \`build.upload.main\` and \`build.upload.dir\` fields.
            Then add the top level \`main\` field to your configuration file:
            \`\`\`
            main = \\"dist/index.js\\"
            \`\`\`"
      `);
    });

    it("should use `build.upload.main` relative to `build.upload.dir`", async () => {
      writeWranglerToml({
        build: {
          upload: {
            main: "./index.js",
            dir: "./foo",
          },
        },
      });
      writeWorkerSource({ basePath: "./foo" });
      mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
      mockSubDomainRequest();
      process.chdir("foo");
      await runWrangler("publish");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`
        "Processing ../wrangler.toml configuration:
          - DEPRECATION: \\"build.upload.main\\":
            Delete the \`build.upload.main\` and \`build.upload.dir\` fields.
            Then add the top level \`main\` field to your configuration file:
            \`\`\`
            main = \\"foo/index.js\\"
            \`\`\`
          - DEPRECATION: \\"build.upload.dir\\":
            Use the top level \\"main\\" field or a command-line argument to specify the entry-point for the Worker."
      `);
    });

    it("should error when both `main` and `build.upload.main` are used", async () => {
      writeWranglerToml({
        main: "./index.js",
        build: {
          upload: {
            main: "./index.js",
            dir: "./foo",
          },
        },
      });
      await expect(runWrangler("publish")).rejects
        .toThrowErrorMatchingInlineSnapshot(`
              "Processing wrangler.toml configuration:
                - Don't define both the \`main\` and \`build.upload.main\` fields in your configuration.
                  They serve the same purpose: to point to the entry-point of your worker.
                  Delete the \`build.upload.main\` and \`build.upload.dir\` field from your config."
            `);
    });

    it("should be able to transpile TypeScript (esm)", async () => {
      writeWranglerToml();
      writeWorkerSource({ format: "ts" });
      mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
      mockSubDomainRequest();
      await runWrangler("publish index.ts");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should be able to transpile TypeScript (sw)", async () => {
      writeWranglerToml();
      writeWorkerSource({ format: "ts", type: "sw" });
      mockUploadWorkerRequest({
        expectedEntry: "var foo = 100;",
        expectedType: "sw",
      });
      mockSubDomainRequest();
      await runWrangler("publish index.ts");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should add referenced text modules into the form upload", async () => {
      writeWranglerToml();
      fs.writeFileSync(
        "./index.js",
        `
import txt from './textfile.txt';
export default{
  fetch(){
    return new Response(txt);
  }
}
`
      );
      fs.writeFileSync("./textfile.txt", "Hello, World!");
      mockUploadWorkerRequest({
        expectedModules: {
          "./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt":
            "Hello, World!",
        },
      });
      mockSubDomainRequest();
      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should be able to transpile entry-points in sub-directories (esm)", async () => {
      writeWranglerToml();
      writeWorkerSource({ basePath: "./src" });
      mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
      mockSubDomainRequest();

      await runWrangler("publish ./src/index.js");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should be able to transpile entry-points in sub-directories (sw)", async () => {
      writeWranglerToml();
      writeWorkerSource({ basePath: "./src", type: "sw" });
      mockUploadWorkerRequest({
        expectedEntry: "var foo = 100;",
        expectedType: "sw",
      });
      mockSubDomainRequest();

      await runWrangler("publish ./src/index.js");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it('should error if a site definition doesn\'t have a "bucket" field', async () => {
      writeWranglerToml({
        // @ts-expect-error we're intentionally setting an invalid config
        site: {},
      });
      writeWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();

      await expect(runWrangler("publish ./index.js")).rejects
        .toThrowErrorMatchingInlineSnapshot(`
              "Processing wrangler.toml configuration:
                - \\"site.bucket\\" is a required field."
            `);

      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "Processing wrangler.toml configuration:
          - \\"site.bucket\\" is a required field.

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should error if there is a `site.entry-point` configuration", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };

      writeWranglerToml({
        site: {
          "entry-point": "./index.js",
          bucket: "assets",
        },
      });
      writeWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      mockUploadAssetsToKVRequest(kvNamespace.id, assets);

      await expect(runWrangler("publish ./index.js")).rejects
        .toThrowErrorMatchingInlineSnapshot(`
              "Processing wrangler.toml configuration:
                - DEPRECATION: \\"site.entry-point\\":
                  The \`site.entry-point\` config field is no longer used.
                  The entry-point should be specified via the command line or the \`main\` config field."
            `);

      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "Processing wrangler.toml configuration:
          - DEPRECATION: \\"site.entry-point\\":
            The \`site.entry-point\` config field is no longer used.
            The entry-point should be specified via the command line or the \`main\` config field.

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(std.warn).toMatchInlineSnapshot(`
        "Processing wrangler.toml configuration:
          - Unexpected fields found in site field: \\"entry-point\\""
      `);
    });

    it("should error if there is no entry-point specified", async () => {
      writeWranglerToml();
      writeWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      await expect(
        runWrangler("publish")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler publish path/to/script\`) or the \`main\` config field."`
      );

      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler publish path/to/script\`) or the \`main\` config field.

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
    });
  });

  describe("asset upload", () => {
    it("should upload all the files in the directory specified by `config.site.bucket`", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      mockUploadAssetsToKVRequest(kvNamespace.id, assets);
      await runWrangler("publish");

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        reading assets/file-2.txt...
        uploading as assets/file-2.5938485188.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("when using a service worker type, it should add an asset manifest as a text_blob, and bind to a namespace", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource({ type: "sw" });
      writeAssets(assets);
      mockUploadWorkerRequest({
        expectedType: "sw",
        expectedModules: {
          __STATIC_CONTENT_MANIFEST:
            '{"file-1.txt":"assets/file-1.2ca234f380.txt","file-2.txt":"assets/file-2.5938485188.txt"}',
        },
        expectedBindings: [
          {
            name: "__STATIC_CONTENT",
            namespace_id: "__test-name-workers_sites_assets-id",
            type: "kv_namespace",
          },
          {
            name: "__STATIC_CONTENT_MANIFEST",
            part: "__STATIC_CONTENT_MANIFEST",
            type: "text_blob",
          },
        ],
      });
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      mockUploadAssetsToKVRequest(kvNamespace.id, assets);

      await runWrangler("publish");

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        reading assets/file-2.txt...
        uploading as assets/file-2.5938485188.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("when using a module worker type, it should add an asset manifest module, and bind to a namespace", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource({ type: "esm" });
      writeAssets(assets);
      mockUploadWorkerRequest({
        expectedBindings: [
          {
            name: "__STATIC_CONTENT",
            namespace_id: "__test-name-workers_sites_assets-id",
            type: "kv_namespace",
          },
        ],
        expectedModules: {
          __STATIC_CONTENT_MANIFEST:
            '{"file-1.txt":"assets/file-1.2ca234f380.txt","file-2.txt":"assets/file-2.5938485188.txt"}',
        },
      });
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      mockUploadAssetsToKVRequest(kvNamespace.id, assets);

      await runWrangler("publish");

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        reading assets/file-2.txt...
        uploading as assets/file-2.5938485188.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should make environment specific kv namespace for assets, even for service envs", async () => {
      // This is the same test as the one before this, but with an env arg
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name-some-env-workers_sites_assets",
        id: "__test-name-some-env-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest({
        env: "some-env",
        expectedBindings: [
          {
            name: "__STATIC_CONTENT",
            namespace_id: "__test-name-some-env-workers_sites_assets-id",
            type: "kv_namespace",
          },
        ],
      });
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      mockUploadAssetsToKVRequest(kvNamespace.id, assets);
      await runWrangler("publish --env some-env --legacy-env false");

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        reading assets/file-2.txt...
        uploading as assets/file-2.5938485188.txt...
        Uploaded test-name (some-env) (TIMINGS)
        Published test-name (some-env) (TIMINGS)
          some-env.test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should make environment specific kv namespace for assets, even for legacy envs", async () => {
      // And this is the same test as the one before this, but with legacyEnv:true
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name-some-env-workers_sites_assets",
        id: "__test-name-some-env-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest({
        legacyEnv: true,
        env: "some-env",
        expectedBindings: [
          {
            name: "__STATIC_CONTENT",
            namespace_id: "__test-name-some-env-workers_sites_assets-id",
            type: "kv_namespace",
          },
        ],
      });
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      mockUploadAssetsToKVRequest(kvNamespace.id, assets);
      await runWrangler("publish --env some-env --legacy-env true");

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        reading assets/file-2.txt...
        uploading as assets/file-2.5938485188.txt...
        Uploaded test-name-some-env (TIMINGS)
        Published test-name-some-env (TIMINGS)
          test-name-some-env.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should only upload files that are not already in the KV namespace", async () => {
      const assets = [
        { filePath: "assets/file-1.txt", content: "Content of file-1" },
        { filePath: "assets/file-2.txt", content: "Content of file-2" },
      ];
      const kvNamespace = {
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource();
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

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        skipping - already uploaded
        reading assets/file-2.txt...
        uploading as assets/file-2.5938485188.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
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
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource();
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

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
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
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource();
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

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
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
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
          include: ["file-1.txt"],
        },
      });
      writeWorkerSource();
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

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
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
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
          exclude: ["file-2.txt"],
        },
      });
      writeWorkerSource();
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

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
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
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
          include: ["file-2.txt"],
        },
      });
      writeWorkerSource();
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

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
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
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
          exclude: ["assets/file-1.txt"],
        },
      });
      writeWorkerSource();
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

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/file-1.txt...
        uploading as assets/file-1.2ca234f380.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
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
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Only expect file-1 to be uploaded
      mockUploadAssetsToKVRequest(kvNamespace.id, assets.slice(0, 1));
      await runWrangler("publish");

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/directory-1/file-1.txt...
        uploading as assets/directory-1/file-1.2ca234f380.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
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
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);
      // Only expect file-2 to be uploaded
      mockUploadAssetsToKVRequest(kvNamespace.id, assets.slice(2));
      await runWrangler("publish");

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/.well-known/file-2.txt...
        uploading as assets/.well-known/file-2.5938485188.txt...
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
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
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
          exclude: ["assets/file-1.txt"],
        },
      });
      writeWorkerSource();
      writeAssets(assets);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);

      await expect(
        runWrangler("publish")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"File assets/too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits"`
      );

      expect(std.out).toMatchInlineSnapshot(`
        "reading assets/large-file.txt...
        uploading as assets/large-file.0ea0637a45.txt..."
      `);
      expect(std.err).toMatchInlineSnapshot(`
        "File assets/too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
    });

    it("should error if the asset key is over 512 characters", async () => {
      const longFilePathAsset = {
        filePath: "assets/" + "folder/".repeat(100) + "file.txt",
        content: "content of file",
      };
      const kvNamespace = {
        title: "__test-name-workers_sites_assets",
        id: "__test-name-workers_sites_assets-id",
      };
      writeWranglerToml({
        main: "./index.js",
        site: {
          bucket: "assets",
        },
      });
      writeWorkerSource();
      writeAssets([longFilePathAsset]);
      mockUploadWorkerRequest();
      mockSubDomainRequest();
      mockListKVNamespacesRequest(kvNamespace);
      mockKeyListRequest(kvNamespace.id, []);

      await expect(
        runWrangler("publish")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"The asset path key \\"assets/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.3da0d0cd12.txt\\" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits\\","`
      );

      expect(std.out).toMatchInlineSnapshot(
        `"reading assets/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.txt..."`
      );
      expect(std.err).toMatchInlineSnapshot(`
        "The asset path key \\"assets/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.3da0d0cd12.txt\\" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits\\",

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
    });
  });

  describe("workers_dev setting", () => {
    it("should publish to a workers.dev domain if workers_dev is undefined", async () => {
      writeWranglerToml();
      writeWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();

      await runWrangler("publish ./index");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should publish to the workers.dev domain if workers_dev is `true`", async () => {
      writeWranglerToml({
        workers_dev: true,
      });
      writeWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest();

      await runWrangler("publish ./index");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should disable the workers.dev domain if workers_dev is `false`", async () => {
      writeWranglerToml({
        workers_dev: false,
      });
      writeWorkerSource();
      mockUploadWorkerRequest();
      mockUpdateWorkerRequest({ enabled: false });

      await runWrangler("publish ./index");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        No publish targets for test-name (TIMINGS)"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should disable the workers.dev domain if workers_dev is undefined but overwritten to `false` in environment", async () => {
      writeWranglerToml({
        env: {
          dev: {
            workers_dev: false,
          },
        },
      });
      writeWorkerSource();
      mockUploadWorkerRequest({
        env: "dev",
      });
      mockUpdateWorkerRequest({ enabled: false, env: "dev" });

      await runWrangler("publish ./index --env dev --legacy-env false");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (dev) (TIMINGS)
        No publish targets for test-name (dev) (TIMINGS)"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should disable the workers.dev domain if workers_dev is `true` but overwritten to `false` in environment", async () => {
      writeWranglerToml({
        workers_dev: true,
        env: {
          dev: {
            workers_dev: false,
          },
        },
      });
      writeWorkerSource();
      mockUploadWorkerRequest({
        env: "dev",
      });
      mockUpdateWorkerRequest({ enabled: false, env: "dev" });

      await runWrangler("publish ./index --env dev --legacy-env false");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (dev) (TIMINGS)
        No publish targets for test-name (dev) (TIMINGS)"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should publish to a workers.dev domain if workers_dev is undefined but overwritten to `true` in environment", async () => {
      writeWranglerToml({
        env: {
          dev: {
            workers_dev: true,
          },
        },
      });
      writeWorkerSource();
      mockUploadWorkerRequest({
        env: "dev",
      });
      mockSubDomainRequest();
      mockUpdateWorkerRequest({ enabled: true, env: "dev" });

      await runWrangler("publish ./index --env dev --legacy-env false");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (dev) (TIMINGS)
        Published test-name (dev) (TIMINGS)
          dev.test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should publish to a workers.dev domain if workers_dev is `false` but overwritten to `true` in environment", async () => {
      writeWranglerToml({
        workers_dev: false,
        env: {
          dev: {
            workers_dev: true,
          },
        },
      });
      writeWorkerSource();
      mockUploadWorkerRequest({
        env: "dev",
      });
      mockSubDomainRequest();
      mockUpdateWorkerRequest({ enabled: true, env: "dev" });

      await runWrangler("publish ./index --env dev --legacy-env false");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (dev) (TIMINGS)
        Published test-name (dev) (TIMINGS)
          dev.test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use the global compatibility_date and compatibility_flags if they are not overwritten by the environment", async () => {
      writeWranglerToml({
        compatibility_date: "2022-01-12",
        compatibility_flags: ["no_global_navigator"],
        env: {
          dev: {},
        },
      });
      writeWorkerSource();
      mockUploadWorkerRequest({
        env: "dev",
        expectedCompatibilityDate: "2022-01-12",
        expectedCompatibilityFlags: ["no_global_navigator"],
      });
      mockSubDomainRequest();
      mockUpdateWorkerRequest({ enabled: true, env: "dev" });

      await runWrangler("publish ./index --env dev --legacy-env false");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (dev) (TIMINGS)
        Published test-name (dev) (TIMINGS)
          dev.test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use the environment specific compatibility_date and compatibility_flags", async () => {
      writeWranglerToml({
        compatibility_date: "2022-01-12",
        compatibility_flags: ["no_global_navigator"],
        env: {
          dev: {
            compatibility_date: "2022-01-13",
            compatibility_flags: ["global_navigator"],
          },
        },
      });
      writeWorkerSource();
      mockUploadWorkerRequest({
        env: "dev",
        expectedCompatibilityDate: "2022-01-13",
        expectedCompatibilityFlags: ["global_navigator"],
      });
      mockSubDomainRequest();
      mockUpdateWorkerRequest({ enabled: true, env: "dev" });

      await runWrangler("publish ./index --env dev --legacy-env false");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (dev) (TIMINGS)
        Published test-name (dev) (TIMINGS)
          dev.test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use the command line --compatibility-date and --compatibility-flags if they are specified", async () => {
      writeWranglerToml({
        compatibility_date: "2022-01-12",
        compatibility_flags: ["no_global_navigator"],
        env: {
          dev: {
            compatibility_date: "2022-01-13",
            compatibility_flags: ["global_navigator"],
          },
        },
      });
      writeWorkerSource();
      mockUploadWorkerRequest({
        env: "dev",
        expectedCompatibilityDate: "2022-01-14",
        expectedCompatibilityFlags: ["url_standard"],
      });
      mockSubDomainRequest();
      mockUpdateWorkerRequest({ enabled: true, env: "dev" });

      await runWrangler(
        "publish ./index --env dev --legacy-env false --compatibility-date 2022-01-14 --compatibility-flags url_standard"
      );

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (dev) (TIMINGS)
        Published test-name (dev) (TIMINGS)
          dev.test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should enable the workers.dev domain if workers_dev is undefined and subdomain is not already available", async () => {
      writeWranglerToml();
      writeWorkerSource();
      mockUploadWorkerRequest({ available_on_subdomain: false });
      mockSubDomainRequest();
      mockUpdateWorkerRequest({ enabled: true });

      await runWrangler("publish ./index");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should enable the workers.dev domain if workers_dev is true and subdomain is not already available", async () => {
      writeWranglerToml({ workers_dev: true });
      writeWorkerSource();
      mockUploadWorkerRequest({ available_on_subdomain: false });
      mockSubDomainRequest();
      mockUpdateWorkerRequest({ enabled: true });

      await runWrangler("publish ./index");

      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should error politely when publishing to workers_dev when there is no workers.dev subdomain", async () => {
      writeWranglerToml({
        workers_dev: true,
      });
      writeWorkerSource();
      mockUploadWorkerRequest();
      mockSubDomainRequest("does-not-exist", false);

      await expect(runWrangler("publish ./index")).rejects
        .toThrowErrorMatchingInlineSnapshot(`
              "Error: You need to register a workers.dev subdomain before publishing to workers.dev
              You can either publish your worker to one or more routes by specifying them in wrangler.toml, or register a workers.dev subdomain here:
              https://dash.cloudflare.com/some-account-id/workers/onboarding"
            `);
    });
  });

  describe("custom builds", () => {
    beforeEach(() => {
      // @ts-expect-error disable the mock we'd setup earlier
      // or else custom builds will timeout immediately
      global.setTimeout.mockRestore();
    });
    it("should run a custom build before publishing", async () => {
      writeWranglerToml({
        build: {
          command: `node -e "console.log('custom build'); require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')"`,
        },
      });

      mockUploadWorkerRequest({
        expectedEntry: "return new Response(123)",
      });
      mockSubDomainRequest();

      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "running: node -e \\"console.log('custom build'); require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')\\"
        Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    if (process.platform !== "win32") {
      it("should run a custom build of multiple steps combined by && before publishing", async () => {
        writeWranglerToml({
          build: {
            command: `echo "custom build" && echo "export default { fetch(){ return new Response(123) } }" > index.js`,
          },
        });

        mockUploadWorkerRequest({
          expectedEntry: "return new Response(123)",
        });
        mockSubDomainRequest();

        await runWrangler("publish index.js");
        expect(std.out).toMatchInlineSnapshot(`
          "running: echo \\"custom build\\" && echo \\"export default { fetch(){ return new Response(123) } }\\" > index.js
          Uploaded test-name (TIMINGS)
          Published test-name (TIMINGS)
            test-name.test-sub-domain.workers.dev"
        `);
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
      });
    }

    it("should throw an error if the entry doesn't exist after the build finishes", async () => {
      writeWranglerToml({
        main: "index.js",
        build: {
          command: `node -e "console.log('custom build');"`,
        },
      });

      await expect(
        runWrangler("publish index.js")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Could not resolve \\"index.js\\" after running custom build: node -e \\"console.log('custom build');\\""`
      );
      expect(std.out).toMatchInlineSnapshot(
        `"running: node -e \\"console.log('custom build');\\""`
      );
      expect(std.err).toMatchInlineSnapshot(`
        "Could not resolve \\"index.js\\" after running custom build: node -e \\"console.log('custom build');\\"

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });
  });

  describe("[wasm_modules]", () => {
    it("should be able to define wasm modules for service-worker format workers", async () => {
      writeWranglerToml({
        wasm_modules: {
          TESTWASMNAME: "./path/to/test.wasm",
        },
      });
      writeWorkerSource({ type: "sw" });
      fs.mkdirSync("./path/to", { recursive: true });
      fs.writeFileSync("./path/to/test.wasm", "SOME WASM CONTENT");
      mockUploadWorkerRequest({
        expectedType: "sw",
        expectedModules: { TESTWASMNAME: "SOME WASM CONTENT" },
        expectedBindings: [
          { name: "TESTWASMNAME", part: "TESTWASMNAME", type: "wasm_module" },
        ],
      });
      mockSubDomainRequest();
      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should error when defining wasm modules for modules format workers", async () => {
      writeWranglerToml({
        wasm_modules: {
          TESTWASMNAME: "./path/to/test.wasm",
        },
      });
      writeWorkerSource({ type: "esm" });
      fs.mkdirSync("./path/to", { recursive: true });
      fs.writeFileSync("./path/to/test.wasm", "SOME WASM CONTENT");

      await expect(
        runWrangler("publish index.js")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code"`
      );
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should resolve wasm modules relative to the wrangler.toml file", async () => {
      fs.mkdirSync("./path/to/and/the/path/to/", { recursive: true });
      fs.writeFileSync(
        "./path/to/wrangler.toml",
        TOML.stringify({
          compatibility_date: "2022-01-12",
          name: "test-name",
          wasm_modules: {
            TESTWASMNAME: "./and/the/path/to/test.wasm",
          },
        }),

        "utf-8"
      );

      writeWorkerSource({ type: "sw" });
      fs.writeFileSync(
        "./path/to/and/the/path/to/test.wasm",
        "SOME WASM CONTENT"
      );
      mockUploadWorkerRequest({
        expectedType: "sw",
        expectedModules: { TESTWASMNAME: "SOME WASM CONTENT" },
        expectedBindings: [
          { name: "TESTWASMNAME", part: "TESTWASMNAME", type: "wasm_module" },
        ],
        expectedCompatibilityDate: "2022-01-12",
      });
      mockSubDomainRequest();
      await runWrangler("publish index.js --config ./path/to/wrangler.toml");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should be able to import .wasm modules from service-worker format workers", async () => {
      writeWranglerToml();
      fs.writeFileSync("./index.js", "import TESTWASMNAME from './test.wasm';");
      fs.writeFileSync("./test.wasm", "SOME WASM CONTENT");
      mockUploadWorkerRequest({
        expectedType: "sw",
        expectedModules: {
          __94b240d0d692281e6467aa42043986e5c7eea034_test_wasm:
            "SOME WASM CONTENT",
        },
        expectedBindings: [
          {
            name: "__94b240d0d692281e6467aa42043986e5c7eea034_test_wasm",
            part: "__94b240d0d692281e6467aa42043986e5c7eea034_test_wasm",
            type: "wasm_module",
          },
        ],
      });
      mockSubDomainRequest();
      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });
  });

  describe("[text_blobs]", () => {
    it("should be able to define text blobs for service-worker format workers", async () => {
      writeWranglerToml({
        text_blobs: {
          TESTTEXTBLOBNAME: "./path/to/text.file",
        },
      });
      writeWorkerSource({ type: "sw" });
      fs.mkdirSync("./path/to", { recursive: true });
      fs.writeFileSync("./path/to/text.file", "SOME TEXT CONTENT");
      mockUploadWorkerRequest({
        expectedType: "sw",
        expectedModules: { TESTTEXTBLOBNAME: "SOME TEXT CONTENT" },
        expectedBindings: [
          {
            name: "TESTTEXTBLOBNAME",
            part: "TESTTEXTBLOBNAME",
            type: "text_blob",
          },
        ],
      });
      mockSubDomainRequest();
      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should error when defining text blobs for modules format workers", async () => {
      writeWranglerToml({
        text_blobs: {
          TESTTEXTBLOBNAME: "./path/to/text.file",
        },
      });
      writeWorkerSource({ type: "esm" });
      fs.mkdirSync("./path/to", { recursive: true });
      fs.writeFileSync("./path/to/text.file", "SOME TEXT CONTENT");

      await expect(
        runWrangler("publish index.js")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[build.upload.rules]\` in your wrangler.toml"`
      );
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[build.upload.rules]\` in your wrangler.toml

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should resolve text blobs relative to the wrangler.toml file", async () => {
      fs.mkdirSync("./path/to/and/the/path/to/", { recursive: true });
      fs.writeFileSync(
        "./path/to/wrangler.toml",
        TOML.stringify({
          compatibility_date: "2022-01-12",
          name: "test-name",
          text_blobs: {
            TESTTEXTBLOBNAME: "./and/the/path/to/text.file",
          },
        }),

        "utf-8"
      );

      writeWorkerSource({ type: "sw" });
      fs.writeFileSync(
        "./path/to/and/the/path/to/text.file",
        "SOME TEXT CONTENT"
      );
      mockUploadWorkerRequest({
        expectedType: "sw",
        expectedModules: { TESTTEXTBLOBNAME: "SOME TEXT CONTENT" },
        expectedBindings: [
          {
            name: "TESTTEXTBLOBNAME",
            part: "TESTTEXTBLOBNAME",
            type: "text_blob",
          },
        ],
        expectedCompatibilityDate: "2022-01-12",
      });
      mockSubDomainRequest();
      await runWrangler("publish index.js --config ./path/to/wrangler.toml");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });
  });

  describe("vars bindings", () => {
    it("should support json bindings", async () => {
      writeWranglerToml({
        vars: {
          text: "plain ol' string",
          count: 1,
          complex: { enabled: true, id: 123 },
        },
      });
      writeWorkerSource();
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        expectedBindings: [
          { name: "text", type: "plain_text", text: "plain ol' string" },
          { name: "count", type: "json", json: 1 },
          {
            name: "complex",
            type: "json",
            json: { enabled: true, id: 123 },
          },
        ],
      });

      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });
  });

  describe("r2 bucket bindings", () => {
    it("should support r2 bucket bindings", async () => {
      writeWranglerToml({
        r2_buckets: [{ binding: "FOO", bucket_name: "foo-bucket" }],
      });
      writeWorkerSource();
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        expectedBindings: [
          { bucket_name: "foo-bucket", name: "FOO", type: "r2_bucket" },
        ],
      });

      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });
  });

  describe("unsafe bindings", () => {
    it("should warn if using unsafe bindings", async () => {
      writeWranglerToml({
        unsafe: {
          bindings: [
            {
              name: "my-binding",
              type: "binding-type",
              param: "binding-param",
            },
          ],
        },
      });
      writeWorkerSource();
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        expectedBindings: [
          {
            name: "my-binding",
            type: "binding-type",
            param: "binding-param",
          },
        ],
      });

      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`
        "Processing wrangler.toml configuration:
          - \\"unsafe\\" fields are experimental and may change or break at any time."
      `);
    });
    it("should warn if using unsafe bindings already handled by wrangler", async () => {
      writeWranglerToml({
        unsafe: {
          bindings: [
            {
              name: "my-binding",
              type: "plain_text",
              text: "text",
            },
          ],
        },
      });
      writeWorkerSource();
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        expectedBindings: [
          {
            name: "my-binding",
            type: "plain_text",
            text: "text",
          },
        ],
      });

      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`
        "Processing wrangler.toml configuration:
          - \\"unsafe\\" fields are experimental and may change or break at any time.
          - \\"unsafe.bindings[0]\\": {\\"name\\":\\"my-binding\\",\\"type\\":\\"plain_text\\",\\"text\\":\\"text\\"}
            - The binding type \\"plain_text\\" is directly supported by wrangler.
              Consider migrating this unsafe binding to a format for 'plain_text' bindings that is supported by wrangler for optimal support.
              For more details, see https://developers.cloudflare.com/workers/cli-wrangler/configuration"
      `);
    });
  });

  describe("upload rules", () => {
    it("should be able to define rules for uploading non-js modules (sw)", async () => {
      writeWranglerToml({
        rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
      });
      fs.writeFileSync("./index.js", `import TEXT from './text.file';`);
      fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        expectedType: "sw",
        expectedBindings: [
          {
            name: "__2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0_text_file",
            part: "__2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0_text_file",
            type: "text_blob",
          },
        ],
        expectedModules: {
          __2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0_text_file:
            "SOME TEXT CONTENT",
        },
      });
      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should be able to define rules for uploading non-js modules (esm)", async () => {
      writeWranglerToml({
        rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
      });
      fs.writeFileSync(
        "./index.js",
        `import TEXT from './text.file'; export default {};`
      );
      fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        expectedType: "esm",
        expectedBindings: [],
        expectedModules: {
          "./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
            "SOME TEXT CONTENT",
        },
      });
      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should log a deprecation warning when using `build.upload.rules`", async () => {
      writeWranglerToml({
        build: {
          upload: {
            rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
          },
        },
      });
      fs.writeFileSync(
        "./index.js",
        `import TEXT from './text.file'; export default {};`
      );
      fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        expectedType: "esm",
        expectedBindings: [],
        expectedModules: {
          "./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
            "SOME TEXT CONTENT",
        },
      });
      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`
        "Processing wrangler.toml configuration:
          - DEPRECATION: The \`build.upload.rules\` config field is no longer used, the rules should be specified via the \`rules\` config field. Delete the \`build.upload\` field from the configuration file, and add this:
            \`\`\`
            [[rules]]
            type = \\"Text\\"
            globs = [ \\"**/*.file\\" ]
            fallthrough = true
            \`\`\`"
      `);
    });

    it("should be able to use fallthrough:true for multiple rules", async () => {
      writeWranglerToml({
        rules: [
          { type: "Text", globs: ["**/*.file"], fallthrough: true },
          { type: "Text", globs: ["**/*.other"], fallthrough: true },
        ],
      });
      fs.writeFileSync(
        "./index.js",
        `import TEXT from './text.file'; import OTHER from './other.other'; export default {};`
      );
      fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
      fs.writeFileSync("./other.other", "SOME OTHER TEXT CONTENT");
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        expectedType: "esm",
        expectedBindings: [],
        expectedModules: {
          "./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
            "SOME TEXT CONTENT",
          "./16347a01366873ed80fe45115119de3c92ab8db0-other.other":
            "SOME OTHER TEXT CONTENT",
        },
      });
      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should be able to use fallthrough:false for multiple rules", async () => {
      writeWranglerToml({
        rules: [
          { type: "Text", globs: ["**/*.file"], fallthrough: false },
          { type: "Text", globs: ["**/*.other"] },
        ],
      });
      fs.writeFileSync(
        "./index.js",
        `import TEXT from './text.file'; import OTHER from './other.other'; export default {};`
      );
      fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
      fs.writeFileSync("./other.other", "SOME OTHER TEXT CONTENT");

      // We throw an error when we come across a file that matched a rule
      // but was skipped because of fallthrough = false
      let err: Error | undefined;
      try {
        await runWrangler("publish index.js");
      } catch (e) {
        err = e as Error;
      }
      expect(err?.message).toMatch(
        `The file ./other.other matched a module rule in your configuration ({"type":"Text","globs":["**/*.other"]}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
      );
    });

    it("should warn when multiple rules for the same type do not have fallback defined", async () => {
      writeWranglerToml({
        rules: [
          { type: "Text", globs: ["**/*.file"] },
          { type: "Text", globs: ["**/*.other"] },
        ],
      });
      fs.writeFileSync(
        "./index.js",
        `import TEXT from './text.file'; import OTHER from './other.other'; export default {};`
      );
      fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
      fs.writeFileSync("./other.other", "SOME OTHER TEXT CONTENT");

      // We throw an error when we come across a file that matched a rule
      // but was skipped because of fallthrough = false
      let err: Error | undefined;
      try {
        await runWrangler("publish index.js");
      } catch (e) {
        err = e as Error;
      }
      expect(err?.message).toMatch(
        `The file ./other.other matched a module rule in your configuration ({"type":"Text","globs":["**/*.other"]}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
      );
      // and the warnings because fallthrough was not explicitly set
      expect(std.warn).toMatchInlineSnapshot(`
        "The module rule at position 1 ({\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.other\\"]}) has the same type as a previous rule (at position 0, {\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.file\\"]}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow this one to also be used, or \`fallthrough = false\` to silence this warning.
        The default module rule {\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.txt\\",\\"**/*.html\\"]} has the same type as a previous rule (at position 0, {\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.file\\"]}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow the default one to also be used, or \`fallthrough = false\` to silence this warning."
      `);
    });
  });

  describe("legacy module specifiers", () => {
    it("should work with legacy module specifiers, with a deprecation warning (1)", async () => {
      writeWranglerToml({
        rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: false }],
      });
      fs.writeFileSync(
        "./index.js",
        `import TEXT from 'text.file'; export default {};`
      );
      fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
      mockSubDomainRequest();
      mockUploadWorkerRequest({
        expectedModules: {
          "./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
            "SOME TEXT CONTENT",
        },
      });
      await runWrangler("publish index.js");
      expect(std.out).toMatchInlineSnapshot(`
        "Uploaded test-name (TIMINGS)
        Published test-name (TIMINGS)
          test-name.test-sub-domain.workers.dev"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(
        `"Deprecation warning: detected a legacy module import in \\"./index.js\\". This will stop working in the future. Replace references to \\"text.file\\" with \\"./text.file\\";"`
      );
    });
  });

  it("should work with legacy module specifiers, with a deprecation warning (2)", async () => {
    writeWranglerToml();
    fs.writeFileSync(
      "./index.js",
      `import WASM from 'index.wasm'; export default {};`
    );
    fs.writeFileSync("./index.wasm", "SOME WASM CONTENT");
    mockSubDomainRequest();
    mockUploadWorkerRequest({
      expectedModules: {
        "./94b240d0d692281e6467aa42043986e5c7eea034-index.wasm":
          "SOME WASM CONTENT",
      },
    });
    await runWrangler("publish index.js");
    expect(std.out).toMatchInlineSnapshot(`
      "Uploaded test-name (TIMINGS)
      Published test-name (TIMINGS)
        test-name.test-sub-domain.workers.dev"
    `);
    expect(std.err).toMatchInlineSnapshot(`""`);
    expect(std.warn).toMatchInlineSnapshot(
      `"Deprecation warning: detected a legacy module import in \\"./index.js\\". This will stop working in the future. Replace references to \\"index.wasm\\" with \\"./index.wasm\\";"`
    );
  });
});

/** Write a mock Worker script to disk. */
function writeWorkerSource({
  basePath = ".",
  format = "js",
  type = "esm",
}: {
  basePath?: string;
  format?: "js" | "ts" | "jsx" | "tsx" | "mjs";
  type?: "esm" | "sw";
} = {}) {
  if (basePath !== ".") {
    fs.mkdirSync(basePath, { recursive: true });
  }
  fs.writeFileSync(
    `${basePath}/index.${format}`,
    type === "esm"
      ? `import { foo } from "./another";
      export default {
        async fetch(request) {
          return new Response('Hello' + foo);
        },
      };`
      : `import { foo } from "./another";
      addEventListener('fetch', event => {
        event.respondWith(new Response('Hello' + foo));
      })`
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
  expectedEntry,
  expectedType = "esm",
  expectedBindings,
  expectedModules = {},
  expectedCompatibilityDate,
  expectedCompatibilityFlags,
  env = undefined,
  legacyEnv = false,
}: {
  available_on_subdomain?: boolean;
  expectedEntry?: string;
  expectedType?: "esm" | "sw";
  expectedBindings?: unknown;
  expectedModules?: Record<string, string>;
  expectedCompatibilityDate?: string;
  expectedCompatibilityFlags?: string[];
  env?: string;
  legacyEnv?: boolean;
} = {}) {
  setMockResponse(
    env && !legacyEnv
      ? "/accounts/:accountId/workers/services/:scriptName/environments/:envName"
      : "/accounts/:accountId/workers/scripts/:scriptName",
    "PUT",
    async ([_url, accountId, scriptName, envName], { body }, queryParams) => {
      expect(accountId).toEqual("some-account-id");
      expect(scriptName).toEqual(
        legacyEnv && env ? `test-name-${env}` : "test-name"
      );
      if (!legacyEnv) {
        expect(envName).toEqual(env);
      }
      expect(queryParams.get("available_on_subdomain")).toEqual("true");
      const formBody = body as FormData;
      if (expectedEntry !== undefined) {
        expect(await (formBody.get("index.js") as File).text()).toMatch(
          expectedEntry
        );
      }
      const metadata = JSON.parse(
        formBody.get("metadata") as string
      ) as WorkerMetadata;
      if (expectedType === "esm") {
        expect(metadata.main_module).toEqual("index.js");
      } else {
        expect(metadata.body_part).toEqual("index.js");
      }
      if (expectedBindings !== undefined) {
        expect(metadata.bindings).toEqual(expectedBindings);
      }
      if (expectedCompatibilityDate !== undefined) {
        expect(metadata.compatibility_date).toEqual(expectedCompatibilityDate);
      }
      if (expectedCompatibilityFlags !== undefined) {
        expect(metadata.compatibility_flags).toEqual(
          expectedCompatibilityFlags
        );
      }
      for (const [name, content] of Object.entries(expectedModules)) {
        expect(await (formBody.get(name) as File).text()).toEqual(content);
      }

      return { available_on_subdomain };
    }
  );
}

/** Create a mock handler for the request to get the account's subdomain. */
function mockSubDomainRequest(
  subdomain = "test-sub-domain",
  registeredWorkersDev = true
) {
  if (registeredWorkersDev) {
    setMockResponse("/accounts/:accountId/workers/subdomain", "GET", () => {
      return { subdomain };
    });
  } else {
    setMockRawResponse("/accounts/:accountId/workers/subdomain", "GET", () => {
      return createFetchResult(null, false, [
        { code: 10007, message: "haven't registered workers.dev" },
      ]);
    });
  }
}

/** Create a mock handler to toggle a <script>.<user>.workers.dev subdomain */
function mockUpdateWorkerRequest({
  env,
  enabled,
  legacyEnv = false,
}: {
  enabled: boolean;
  env?: string | undefined;
  legacyEnv?: boolean | undefined;
}) {
  const requests = { count: 0 };
  const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
  const environment = env && !legacyEnv ? "/environments/:envName" : "";
  setMockResponse(
    `/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/subdomain`,
    "POST",
    ([_url, accountId, scriptName, envName], { body }) => {
      expect(accountId).toEqual("some-account-id");
      expect(scriptName).toEqual(
        legacyEnv && env ? `test-name-${env}` : "test-name"
      );
      if (!legacyEnv) {
        expect(envName).toEqual(env);
      }
      expect(JSON.parse(body as string)).toEqual({ enabled });
      return null;
    }
  );
  return requests;
}

function mockPublishRoutesRequest({
  routes,
  env = undefined,
  legacyEnv = false,
}: {
  routes: string[];
  env?: string | undefined;
  legacyEnv?: boolean | undefined;
}) {
  const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
  const environment = env && !legacyEnv ? "/environments/:envName" : "";

  setMockResponse(
    `/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/routes`,
    "PUT",
    ([_url, accountId, scriptName, envName], { body }) => {
      expect(accountId).toEqual("some-account-id");
      expect(scriptName).toEqual(
        legacyEnv && env ? `test-name-${env}` : "test-name"
      );
      if (!legacyEnv) {
        expect(envName).toEqual(env);
      }

      expect(JSON.parse(body as string)).toEqual(
        routes.map((pattern) => ({ pattern }))
      );
      return null;
    }
  );
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
