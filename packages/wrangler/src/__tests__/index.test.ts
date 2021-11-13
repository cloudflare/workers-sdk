import execa from "execa";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as TOML from "@iarna/toml";

async function w(cmd: string | string[] = []) {
  return await execa(
    path.join(__dirname, "../../bin/wrangler.js"),
    typeof cmd === "string" ? cmd.split(" ") : cmd
  );
}

describe("wrangler", () => {
  it("should run", async () => {
    expect((await w()).stdout).toMatchInlineSnapshot(`
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
        --config   Path to .toml configuration file  [string]
        --help     Show help  [boolean]
        --version  Show version number  [boolean]

      Options:
        --local  Run on my machine  [boolean] [default: false]"
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

    test("simple", async () => {
      await w("init");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(parsed.name).toBe("init");
      expect(typeof parsed.compatibility_date).toBe("string");
    });

    it("should error when wrangler.toml already exists", async () => {
      fs.closeSync(fs.openSync("./wrangler.toml", "w"));
      const { stderr } = await w("init");
      expect(stderr.endsWith("wrangler.toml already exists.")).toBe(true);
    });
    it("should create a named config", async () => {
      await w("init xyz");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(parsed.name).toBe("xyz");
    });
  });

  // TODO: setup a "api server" to mock requests
});
