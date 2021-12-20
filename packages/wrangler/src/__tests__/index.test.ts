import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import { main } from "../index";
import { setMock, unsetAllMocks } from "./mock-cfetch";
import { mockConfirm } from "./mock-dialogs";

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
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "init-"));
      process.chdir(tmpDir);
    });

    afterEach(async () => {
      process.chdir(ogcwd);
      await fsp.rm(tmpDir, { recursive: true });
    });

    it("should create a wrangler.toml", async () => {
      mockConfirm({
        text: "No package.json found. Would you like to create one?",
        result: false,
      });
      await w("init");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(typeof parsed.compatibility_date).toBe("string");
      expect(fs.existsSync("./package.json")).toBe(false);
      expect(fs.existsSync("./tsconfig.json")).toBe(false);
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
      mockConfirm(
        {
          text: "Do you want to continue initializing this project?",
          result: true,
        },
        {
          text: "No package.json found. Would you like to create one?",
          result: false,
        }
      );
      const { stderr } = await w("init");
      expect(stderr).toContain("wrangler.toml file already exists!");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(typeof parsed.compatibility_date).toBe("string");
    });

    it("should create a package.json if none is found and user confirms", async () => {
      mockConfirm(
        {
          text: "No package.json found. Would you like to create one?",
          result: true,
        },
        {
          text: "Would you like to use typescript?",
          result: false,
        }
      );
      await w("init");
      expect(fs.existsSync("./package.json")).toBe(true);
      const packageJson = JSON.parse(
        fs.readFileSync("./package.json", "utf-8")
      );
      expect(packageJson.name).toEqual("worker"); // TODO: should we infer the name from the directory?
      expect(packageJson.version).toEqual("0.0.1");
      expect(fs.existsSync("./tsconfig.json")).toBe(false);
    });

    it("should not touch an existing package.json in the same directory", async () => {
      mockConfirm({
        text: "Would you like to use typescript?",
        result: false,
      });

      fs.writeFileSync(
        "./package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );

      await w("init");
      const packageJson = JSON.parse(
        fs.readFileSync("./package.json", "utf-8")
      );
      expect(packageJson.name).toEqual("test");
      expect(packageJson.version).toEqual("1.0.0");
    });

    it("should not touch an existing package.json in an ancestor directory", async () => {
      mockConfirm({
        text: "Would you like to use typescript?",
        result: false,
      });

      fs.writeFileSync(
        "./package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );

      fs.mkdirSync("./sub-1/sub-2", { recursive: true });
      process.chdir("./sub-1/sub-2");

      await w("init");
      expect(fs.existsSync("./package.json")).toBe(false);
      expect(fs.existsSync("../../package.json")).toBe(true);

      const packageJson = JSON.parse(
        fs.readFileSync("../../package.json", "utf-8")
      );
      expect(packageJson.name).toEqual("test");
      expect(packageJson.version).toEqual("1.0.0");
    });

    it("should create a tsconfig.json and install `workers-types` if none is found and user confirms", async () => {
      mockConfirm(
        {
          text: "No package.json found. Would you like to create one?",
          result: true,
        },
        {
          text: "Would you like to use typescript?",
          result: true,
        }
      );
      await w("init");
      expect(fs.existsSync("./tsconfig.json")).toBe(true);
      const tsconfigJson = JSON.parse(
        fs.readFileSync("./tsconfig.json", "utf-8")
      );
      expect(tsconfigJson.compilerOptions.types).toEqual([
        "@cloudflare/workers-types",
      ]);
      const packageJson = JSON.parse(
        fs.readFileSync("./package.json", "utf-8")
      );
      expect(packageJson.devDependencies).toEqual({
        "@cloudflare/workers-types": expect.any(String),
      });
    });

    it("should not touch an existing tsconfig.json in the same directory", async () => {
      fs.writeFileSync(
        "./package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );
      fs.writeFileSync(
        "./tsconfig.json",
        JSON.stringify({ compilerOptions: {} }),
        "utf-8"
      );

      await w("init");
      const tsconfigJson = JSON.parse(
        fs.readFileSync("./tsconfig.json", "utf-8")
      );
      expect(tsconfigJson.compilerOptions).toEqual({});
    });

    it("should not touch an existing package.json in an ancestor directory", async () => {
      fs.writeFileSync(
        "./package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );
      fs.writeFileSync(
        "./tsconfig.json",
        JSON.stringify({ compilerOptions: {} }),
        "utf-8"
      );

      fs.mkdirSync("./sub-1/sub-2", { recursive: true });
      process.chdir("./sub-1/sub-2");

      await w("init");
      expect(fs.existsSync("./tsconfig.json")).toBe(false);
      expect(fs.existsSync("../../tsconfig.json")).toBe(true);

      const tsconfigJson = JSON.parse(
        fs.readFileSync("../../tsconfig.json", "utf-8")
      );
      expect(tsconfigJson.compilerOptions).toEqual({});
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
    afterEach(() => {
      unsetAllMocks();
    });

    it("can create a namespace", async () => {
      const KVNamespaces: { title: string; id: string }[] = [];
      setMock("/accounts/:accountId/storage/kv/namespaces", (uri, init) => {
        expect(init.method === "POST");
        expect(uri[0]).toEqual(
          "/accounts/some-account-id/storage/kv/namespaces"
        );
        const { title } = JSON.parse(init.body);
        expect(title).toEqual("worker-UnitTestNamespace");
        KVNamespaces.push({ title, id: "some-namespace-id" });
        return { id: "some-namespace-id" };
      });

      await w("kv:namespace create UnitTestNamespace");

      expect(KVNamespaces).toEqual([
        {
          title: "worker-UnitTestNamespace",
          id: "some-namespace-id",
        },
      ]);
    });

    it("can list namespaces", async () => {
      const KVNamespaces: { title: string; id: string }[] = [
        { title: "title-1", id: "id-1" },
        { title: "title-2", id: "id-2" },
      ];
      setMock(
        "/accounts/:accountId/storage/kv/namespaces\\?:qs",
        (uri, init) => {
          expect(uri[0]).toContain(
            "/accounts/some-account-id/storage/kv/namespaces"
          );
          expect(uri[2]).toContain("per_page=100");
          expect(uri[2]).toContain("order=title");
          expect(uri[2]).toContain("direction=asc");
          expect(uri[2]).toContain("page=1");
          expect(init).toBe(undefined);
          return KVNamespaces;
        }
      );
      const { stdout } = await w("kv:namespace list");
      const namespaces = JSON.parse(stdout) as { id: string; title: string }[];
      expect(namespaces).toEqual(KVNamespaces);
    });

    it("can delete a namespace", async () => {
      let accountId = "";
      let namespaceId = "";
      setMock(
        "/accounts/:accountId/storage/kv/namespaces/:namespaceId",
        (uri, init) => {
          accountId = uri[1];
          namespaceId = uri[2];
          expect(uri[0]).toEqual(
            "/accounts/some-account-id/storage/kv/namespaces/some-namespace-id"
          );
          expect(init.method).toBe("DELETE");
        }
      );
      await w(`kv:namespace delete --namespace-id some-namespace-id`);
      expect(accountId).toEqual("some-account-id");
      expect(namespaceId).toEqual("some-namespace-id");
    });
  });
});
