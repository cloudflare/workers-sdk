import * as fs from "node:fs";
import { readFileSync } from "node:fs";
import patchConsole from "patch-console";
import Dev from "../dev/dev";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";

describe("wrangler dev", () => {
  mockAccountId();
  mockApiToken();
  runInTempDir();
  const std = mockConsoleMethods();
  afterEach(() => {
    (Dev as jest.Mock).mockClear();
    patchConsole(() => {});
    unsetAllMocks();
  });

  describe("entry-points", () => {
    it("should error if there is no entry-point specified", async () => {
      writeWranglerToml();

      await expect(
        runWrangler("dev")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler dev path/to/script\`) or the \`main\` config field."`
      );

      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler dev path/to/script\`) or the \`main\` config field.

        [32m%s[0m If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
      `);
    });

    it("should use `main` from the top-level environment", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].entry.file).toMatch(
        /index\.js$/
      );
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use `main` from a named environment", async () => {
      writeWranglerToml({
        env: {
          ENV1: {
            main: "index.js",
          },
        },
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev --env=ENV1");
      expect((Dev as jest.Mock).mock.calls[0][0].entry.file).toMatch(
        /index\.js$/
      );
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use `main` from a named environment, rather than the top-level", async () => {
      writeWranglerToml({
        main: "other.js",
        env: {
          ENV1: {
            main: "index.js",
          },
        },
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev --env=ENV1");
      expect((Dev as jest.Mock).mock.calls[0][0].entry.file).toMatch(
        /index\.js$/
      );
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });
  });

  describe("host", () => {
    it("should resolve a host to its zone", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
      await runWrangler("dev --host some-host.com");
      expect((Dev as jest.Mock).mock.calls[0][0].zone).toEqual({
        host: "some-host.com",
        id: "some-zone-id",
      });
    });

    it("should read wrangler.toml's dev.host", async () => {
      writeWranglerToml({
        main: "index.js",
        dev: {
          host: "some-host.com",
        },
      });
      fs.writeFileSync("index.js", `export default {};`);
      mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].zone.host).toEqual(
        "some-host.com"
      );
    });

    it("should read --route", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
      await runWrangler("dev --route http://some-host.com/some/path/*");
      expect((Dev as jest.Mock).mock.calls[0][0].zone.host).toEqual(
        "some-host.com"
      );
    });

    it("should read wrangler.toml's routes", async () => {
      writeWranglerToml({
        main: "index.js",
        routes: [
          "http://some-host.com/some/path/*",
          "http://some-other-host.com/path/*",
        ],
      });
      fs.writeFileSync("index.js", `export default {};`);
      mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].zone.host).toEqual(
        "some-host.com"
      );
    });

    it("should read wrangler.toml's environment specific routes", async () => {
      writeWranglerToml({
        main: "index.js",
        routes: [
          "http://a-host.com/some/path/*",
          "http://another-host.com/path/*",
        ],
        env: {
          staging: {
            routes: [
              "http://some-host.com/some/path/*",
              "http://some-other-host.com/path/*",
            ],
          },
        },
      });
      fs.writeFileSync("index.js", `export default {};`);
      mockGetZones("some-host.com", [{ id: "some-zone-id" }]);
      await runWrangler("dev --env staging");
      expect((Dev as jest.Mock).mock.calls[0][0].zone.host).toEqual(
        "some-host.com"
      );
    });

    it("given a long host, it should use the longest subdomain that resolves to a zone", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      mockGetZones("111.222.333.some-host.com", []);
      mockGetZones("222.333.some-host.com", []);
      mockGetZones("333.some-host.com", [{ id: "some-zone-id" }]);
      await runWrangler("dev --host 111.222.333.some-host.com");
      expect((Dev as jest.Mock).mock.calls[0][0].zone).toEqual({
        host: "111.222.333.some-host.com",
        id: "some-zone-id",
      });
    });

    it("should, in order, use args.host/config.dev.host/args.routes/(config.route|config.routes)", async () => {
      // This test might seem like it's testing implementation details, but let's be specific and consider it a spec

      fs.writeFileSync("index.js", `export default {};`);

      // config.routes
      mockGetZones("5.some-host.com", [{ id: "some-zone-id-5" }]);
      writeWranglerToml({
        main: "index.js",
        routes: ["http://5.some-host.com/some/path/*"],
      });
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].zone).toEqual({
        host: "5.some-host.com",
        id: "some-zone-id-5",
      });
      (Dev as jest.Mock).mockClear();

      // config.route
      mockGetZones("4.some-host.com", [{ id: "some-zone-id-4" }]);
      writeWranglerToml({
        main: "index.js",
        route: "https://4.some-host.com/some/path/*",
      });
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].zone).toEqual({
        host: "4.some-host.com",
        id: "some-zone-id-4",
      });
      (Dev as jest.Mock).mockClear();

      // --routes
      mockGetZones("3.some-host.com", [{ id: "some-zone-id-3" }]);
      writeWranglerToml({
        main: "index.js",
        route: "https://4.some-host.com/some/path/*",
      });
      await runWrangler("dev --routes http://3.some-host.com/some/path/*");
      expect((Dev as jest.Mock).mock.calls[0][0].zone).toEqual({
        host: "3.some-host.com",
        id: "some-zone-id-3",
      });
      (Dev as jest.Mock).mockClear();

      // config.dev.host
      mockGetZones("2.some-host.com", [{ id: "some-zone-id-2" }]);
      writeWranglerToml({
        main: "index.js",
        dev: {
          host: `2.some-host.com`,
        },
        route: "4.some-host.com/some/path/*",
      });
      await runWrangler("dev --routes http://3.some-host.com/some/path/*");
      expect((Dev as jest.Mock).mock.calls[0][0].zone).toEqual({
        host: "2.some-host.com",
        id: "some-zone-id-2",
      });
      (Dev as jest.Mock).mockClear();

      // --host
      mockGetZones("1.some-host.com", [{ id: "some-zone-id-1" }]);
      writeWranglerToml({
        main: "index.js",
        dev: {
          host: `2.some-host.com`,
        },
        route: "4.some-host.com/some/path/*",
      });
      await runWrangler(
        "dev --routes http://3.some-host.com/some/path/* --host 1.some-host.com"
      );
      expect((Dev as jest.Mock).mock.calls[0][0].zone).toEqual({
        host: "1.some-host.com",
        id: "some-zone-id-1",
      });
      (Dev as jest.Mock).mockClear();
    });

    it("should error if a host can't resolve to a zone", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      mockGetZones("some-host.com", []);
      await expect(
        runWrangler("dev --host some-host.com")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Could not find zone for some-host.com"`
      );
    });

    it("should not try to resolve a zone when starting in local mode", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev --host some-host.com --local");
      expect((Dev as jest.Mock).mock.calls[0][0].zone).toEqual(undefined);
    });
  });

  describe("custom builds", () => {
    it("should run a custom build before starting `dev`", async () => {
      writeWranglerToml({
        build: {
          command: `node -e "console.log('custom build'); require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')"`,
        },
      });

      await runWrangler("dev index.js");

      expect(readFileSync("index.js", "utf-8")).toMatchInlineSnapshot(
        `"export default { fetch(){ return new Response(123) } }"`
      );

      // and the command would pass through
      expect((Dev as jest.Mock).mock.calls[0][0].build).toEqual({
        command:
          "node -e \"console.log('custom build'); require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')\"",
        cwd: undefined,
        watch_dir: "src",
      });
      expect(std.out).toMatchInlineSnapshot(
        `"running: node -e \\"console.log('custom build'); require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')\\""`
      );
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    if (process.platform !== "win32") {
      it("should run a custom build of multiple steps combined by && before starting `dev`", async () => {
        writeWranglerToml({
          build: {
            command: `echo "custom build" && echo "export default { fetch(){ return new Response(123) } }" > index.js`,
          },
        });

        await runWrangler("dev index.js");

        expect(readFileSync("index.js", "utf-8")).toMatchInlineSnapshot(`
          "export default { fetch(){ return new Response(123) } }
          "
        `);

        expect(std.out).toMatchInlineSnapshot(
          `"running: echo \\"custom build\\" && echo \\"export default { fetch(){ return new Response(123) } }\\" > index.js"`
        );
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
        runWrangler("dev")
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

  describe("upstream-protocol", () => {
    it("should default upstream-protocol to `https`", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].upstreamProtocol).toEqual(
        "https"
      );
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should warn if `--upstream-protocol=http` is used", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev --upstream-protocol=http");
      expect((Dev as jest.Mock).mock.calls[0][0].upstreamProtocol).toEqual(
        "http"
      );
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`
        "Setting upstream-protocol to http is not currently implemented.
        If this is required in your project, please add your use case to the following issue:
        https://github.com/cloudflare/wrangler2/issues/583."
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });
  });

  describe("local-protocol", () => {
    it("should default local-protocol to `http`", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].localProtocol).toEqual("http");
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use `local_protocol` from `wrangler.toml`, if available", async () => {
      writeWranglerToml({
        main: "index.js",
        dev: {
          local_protocol: "https",
        },
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].localProtocol).toEqual(
        "https"
      );
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use --local-protocol command line arg, if provided", async () => {
      // Here we show that the command line overrides the wrangler.toml by
      // setting the config to https, and then setting it back to http on the command line.
      writeWranglerToml({
        main: "index.js",
        dev: {
          local_protocol: "https",
        },
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev --local-protocol=http");
      expect((Dev as jest.Mock).mock.calls[0][0].localProtocol).toEqual("http");
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });
  });

  describe("ip", () => {
    it("should default ip to localhost", async () => {
      writeWranglerToml({
        main: "index.js",
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].ip).toEqual("localhost");
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use to `ip` from `wrangler.toml`, if available", async () => {
      writeWranglerToml({
        main: "index.js",
        dev: {
          ip: "0.0.0.0",
        },
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].ip).toEqual("0.0.0.0");
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });

    it("should use --ip command line arg, if provided", async () => {
      writeWranglerToml({
        main: "index.js",
        dev: {
          ip: "1.1.1.1",
        },
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev --ip=0.0.0.0");
      expect((Dev as jest.Mock).mock.calls[0][0].ip).toEqual("0.0.0.0");
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });
  });

  describe("durable_objects", () => {
    it("should warn if there is one or more remote Durable Object", async () => {
      writeWranglerToml({
        main: "index.js",
        durable_objects: {
          bindings: [
            { name: "NAME_1", class_name: "CLASS_1" },
            {
              name: "NAME_2",
              class_name: "CLASS_2",
              script_name: "SCRIPT_A",
            },
            { name: "NAME_3", class_name: "CLASS_3" },
            {
              name: "NAME_4",
              class_name: "CLASS_4",
              script_name: "SCRIPT_B",
            },
          ],
        },
      });
      fs.writeFileSync("index.js", `export default {};`);
      await runWrangler("dev");
      expect((Dev as jest.Mock).mock.calls[0][0].ip).toEqual("localhost");
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`
        "WARNING: You have Durable Object bindings, which are not defined locally in the worker being developed.
        Be aware that changes to the data stored in these Durable Objects will be permanent and affect the live instances.
        Remote Durable Objects that are affected:
        - {\\"name\\":\\"NAME_2\\",\\"class_name\\":\\"CLASS_2\\",\\"script_name\\":\\"SCRIPT_A\\"}
        - {\\"name\\":\\"NAME_4\\",\\"class_name\\":\\"CLASS_4\\",\\"script_name\\":\\"SCRIPT_B\\"}"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
    });
  });
});

function mockGetZones(domain: string, zones: { id: string }[] = []) {
  const removeMock = setMockResponse(
    "/zones",
    "GET",
    (_urlPieces, _init, queryParams) => {
      expect([...queryParams.entries()]).toEqual([["name", domain]]);
      // Because the API URL `/zones` is the same for each request, we can get into a situation where earlier mocks get triggered for later requests. So, we simply clear the mock on every trigger.
      removeMock();
      return zones;
    }
  );
}
