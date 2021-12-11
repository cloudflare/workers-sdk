import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import { main } from "../index";
// @ts-expect-error we're mocking cfetch, so of course setMock isn't a thing
import { setMock, unsetAllMocks } from "../cfetch";

jest.mock("../cfetch", () => {
  return jest.requireActual("./mock-cfetch");
});

async function w(cmd: void | string, options?: { tap: boolean }) {
  const tapped = options?.tap ? tap() : undefined;
  await main([...(cmd ? cmd.split(" ") : [])]);
  tapped?.off();
  return { stdout: tapped?.out, stderr: tapped?.err };
}

function tap() {
  const oldLog = console.log;
  const oldError = console.error;

  const toReturn = {
    off: () => {
      console.log = oldLog;
      console.error = oldError;
    },
    out: "",
    err: "",
  };

  console.log = (...args) => {
    toReturn.out += args.join("");
    oldLog.apply(console, args);
    // console.trace(...args); // use this if you want to find the true source of your console.log
  };
  console.error = (...args) => {
    toReturn.err += args.join("");
    oldError.apply(console, args);
  };

  return toReturn;
}

describe("wrangler", () => {
  it("should run", async () => {
    const { stdout } = await w(undefined, { tap: true });

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
  });

  describe("init", () => {
    const ogcwd = process.cwd();

    beforeEach(() => {
      process.chdir(path.join(__dirname, "fixtures", "init"));
    });

    afterEach(async () => {
      await fsp.rm("./wrangler.toml");
      process.chdir(ogcwd);
    });

    it("should create a wrangler.toml", async () => {
      await w("init");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(typeof parsed.compatibility_date).toBe("string");
    });

    it("should error when wrangler.toml already exists", async () => {
      fs.closeSync(fs.openSync("./wrangler.toml", "w"));
      const { stderr } = await w("init", { tap: true });
      expect(stderr.endsWith("wrangler.toml already exists.")).toBe(true);
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
      const { stdout } = await w("kv:namespace list", { tap: true });
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
