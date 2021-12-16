import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import { main } from "../index";
import { setMock, unsetAllMocks } from "./mock-cfetch";
import { existsSync } from "node:fs";
import { dialogs } from "../dialogs";

jest.mock("../cfetch", () => jest.requireActual("./mock-cfetch"));

async function w(cmd?: string) {
  const logSpy = jest.spyOn(console, "log").mockImplementation();
  const errorSpy = jest.spyOn(console, "error").mockImplementation();
  const warnSpy = jest.spyOn(console, "warn").mockImplementation();
  try {
    await main(cmd?.split(" ") ?? []);
    return {
      stdout: logSpy.mock.calls.flat(2).join("\n"),
      stderr: errorSpy.mock.calls.flat(2).join("\n"),
      warnings: warnSpy.mock.calls.flat(2).join("\n"),
    };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  }
}

describe("wrangler", () => {
  describe("no command", () => {
    it("should display a list of available commands", async () => {
      const { stdout, stderr } = await w();

      expect(stdout).toMatchInlineSnapshot(`
        "wrangler

        Commands:
          wrangler init [name]       📥 Create a wrangler.toml configuration file
          wrangler dev <filename>    👂 Start a local server for developing your worker
          wrangler publish [script]  🆙 Publish your Worker to Cloudflare.
          wrangler tail [name]       🦚 Starts a log tailing session for a deployed Worker.
          wrangler secret            🤫 Generate a secret that can be referenced in the worker script
          wrangler kv:namespace      🗂️  Interact with your Workers KV Namespaces
          wrangler kv:key            🔑 Individually manage Workers KV key-value pairs
          wrangler kv:bulk           💪 Interact with multiple Workers KV key-value pairs at once
          wrangler pages             ⚡️ Configure Cloudflare Pages

        Flags:
          -c, --config   Path to .toml configuration file  [string]
          -h, --help     Show help  [boolean]
          -v, --version  Show version number  [boolean]

        Options:
          -l, --local  Run on my machine  [boolean] [default: false]"
      `);

      expect(stderr).toMatchInlineSnapshot(`""`);
    });
  });

  describe("invalid command", () => {
    it("should display an error", async () => {
      const { stdout, stderr } = await w("invalid-command");

      expect(stdout).toMatchInlineSnapshot(`
        "wrangler

        Commands:
          wrangler init [name]       📥 Create a wrangler.toml configuration file
          wrangler dev <filename>    👂 Start a local server for developing your worker
          wrangler publish [script]  🆙 Publish your Worker to Cloudflare.
          wrangler tail [name]       🦚 Starts a log tailing session for a deployed Worker.
          wrangler secret            🤫 Generate a secret that can be referenced in the worker script
          wrangler kv:namespace      🗂️  Interact with your Workers KV Namespaces
          wrangler kv:key            🔑 Individually manage Workers KV key-value pairs
          wrangler kv:bulk           💪 Interact with multiple Workers KV key-value pairs at once
          wrangler pages             ⚡️ Configure Cloudflare Pages

        Flags:
          -c, --config   Path to .toml configuration file  [string]
          -h, --help     Show help  [boolean]
          -v, --version  Show version number  [boolean]

        Options:
          -l, --local  Run on my machine  [boolean] [default: false]"
      `);

      expect(stderr).toMatchInlineSnapshot(`
        "
        Unknown command: invalid-command."
      `);
    });
  });

  describe("init", () => {
    const ogcwd = process.cwd();

    beforeEach(() => {
      process.chdir(path.join(__dirname, "fixtures", "init"));
    });

    afterEach(async () => {
      if (existsSync("./wrangler.toml")) {
        await fsp.rm("./wrangler.toml");
      }
      process.chdir(ogcwd);
    });

    it("should create a wrangler.toml", async () => {
      await w("init");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(typeof parsed.compatibility_date).toBe("string");
    });

    it("should display warning when wrangler.toml already exists, and exit if user does not want to carry on", async () => {
      fs.closeSync(fs.openSync("./wrangler.toml", "w"));
      mockConfirm({
        text: "Do you want to continue initializing this project?",
        result: false,
      });
      const { stderr } = await w("init");
      expect(stderr).toContain("wrangler.toml file already exists!");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(typeof parsed.compatibility_date).toBe("undefined");
    });

    it("should display warning when wrangler.toml already exists, but continue if user does want to carry on", async () => {
      fs.closeSync(fs.openSync("./wrangler.toml", "w"));
      mockConfirm({
        text: "Do you want to continue initializing this project?",
        result: true,
      });
      const { stderr } = await w("init");
      expect(stderr).toContain("wrangler.toml file already exists!");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(typeof parsed.compatibility_date).toBe("string");
    });

    it("should error if `--type` is used", async () => {
      const noValue = await w("init --type");
      expect(noValue.stderr).toMatchInlineSnapshot(
        `"The --type option is no longer supported."`
      );
    });

    it("should error if `--type javascript` is used", async () => {
      const javascriptValue = await w("init --type javascript");
      expect(javascriptValue.stderr).toMatchInlineSnapshot(
        `"The --type option is no longer supported."`
      );
    });

    it("should error if `--type rust` is used", async () => {
      const rustValue = await w("init --type rust");
      expect(rustValue.stderr).toMatchInlineSnapshot(
        `"The --type option is no longer supported."`
      );
    });

    it("should error if `--type webpack` is used", async () => {
      const webpackValue = await w("init --type webpack");
      expect(webpackValue.stderr).toMatchInlineSnapshot(`
        "The --type option is no longer supported.
        If you wish to use webpack then you will need to create a custom build."
      `);
    });
  });

  describe("kv:namespace", () => {
    afterAll(() => {
      unsetAllMocks();
    });
    let KVNamespaces: { title: string; id: string }[] = [];
    it("can create a namespace", async () => {
      setMock("/accounts/:accountId/storage/kv/namespaces", (uri, init) => {
        expect(init.method === "POST");
        const body = JSON.parse(init.body);
        expect(body.title).toBe("worker-UnitTestNamespace");
        KVNamespaces.push({ title: body.title, id: "some-namespace-id" });
        return { id: "some-namespace-id" };
      });

      await w("kv:namespace create UnitTestNamespace");
      expect(
        KVNamespaces.find((ns) => ns.title === `worker-UnitTestNamespace`)
      ).toBeTruthy();
    });

    let createdNamespace: { id: string; title: string };
    it("can list namespaces", async () => {
      setMock(
        "/accounts/:accountId/storage/kv/namespaces\\?:qs",
        (uri, init) => {
          expect(init).toBe(undefined);
          return KVNamespaces;
        }
      );
      const { stdout } = await w("kv:namespace list");
      const namespaces = JSON.parse(stdout);
      createdNamespace = namespaces.find(
        (ns) => ns.title === "worker-UnitTestNamespace"
      );
      expect(createdNamespace.title).toBe("worker-UnitTestNamespace");
    });

    it("can delete a namespace", async () => {
      const namespaceIdToDelete = createdNamespace.id;
      setMock(
        "/accounts/:accountId/storage/kv/namespaces/:namespaceId",
        (uri, init) => {
          expect(init.method).toBe("DELETE");
          KVNamespaces = KVNamespaces.filter(
            (ns) => ns.id !== namespaceIdToDelete
          );
        }
      );
      await w(`kv:namespace delete --namespace-id ${namespaceIdToDelete}`);
      expect(KVNamespaces.find((ns) => ns.id === namespaceIdToDelete)).toBe(
        undefined
      );
    });
  });
});

/**
 * Create a mock version of `confirm()` that will respond with configured results
 * for configured confirmation text messages.
 *
 * If there is a call to `confirm()` that does not match any of the expectations
 * then an error is thrown.
 */
function mockConfirm(...expectations: { text: string; result: boolean }[]) {
  const mockImplementation = async (text: string) => {
    for (const { text: expectedText, result } of expectations) {
      if (text === expectedText) {
        return result;
      }
    }
    throw new Error(`Unexpected confirmation message: ${text}`);
  };
  return jest.spyOn(dialogs, "confirm").mockImplementation(mockImplementation);
}
