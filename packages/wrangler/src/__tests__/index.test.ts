import * as fsp from "node:fs/promises";
import * as TOML from "@iarna/toml";
import { mockConfirm } from "./mock-dialogs";
import { runWrangler } from "./run-wrangler";
import { runInTempDir } from "./run-in-tmp";
import * as fs from "node:fs";

describe("wrangler", () => {
  runInTempDir();

  describe("no command", () => {
    it("should display a list of available commands", async () => {
      const { stdout, stderr } = await runWrangler();

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
      const { stdout, stderr } = await runWrangler("invalid-command");

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
    it("should create a wrangler.toml", async () => {
      mockConfirm({
        text: "No package.json found. Would you like to create one?",
        result: false,
      });
      await runWrangler("init");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(typeof parsed.compatibility_date).toBe("string");
      expect(fs.existsSync("./package.json")).toBe(false);
      expect(fs.existsSync("./tsconfig.json")).toBe(false);
    });

    it("should display warning when wrangler.toml already exists, and exit if user does not want to carry on", async () => {
      fs.writeFileSync("./wrangler.toml", "", "utf-8");
      mockConfirm({
        text: "Do you want to continue initializing this project?",
        result: false,
      });
      const { stderr } = await runWrangler("init");
      expect(stderr).toContain("wrangler.toml file already exists!");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(typeof parsed.compatibility_date).toBe("undefined");
    });

    it("should display warning when wrangler.toml already exists, but continue if user does want to carry on", async () => {
      fs.writeFileSync("./wrangler.toml", "", "utf-8");
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
      const { stderr } = await runWrangler("init");
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
      await runWrangler("init");
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

      await runWrangler("init");
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

      await runWrangler("init");
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
      await runWrangler("init");
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

      await runWrangler("init");
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

      await runWrangler("init");
      expect(fs.existsSync("./tsconfig.json")).toBe(false);
      expect(fs.existsSync("../../tsconfig.json")).toBe(true);

      const tsconfigJson = JSON.parse(
        fs.readFileSync("../../tsconfig.json", "utf-8")
      );
      expect(tsconfigJson.compilerOptions).toEqual({});
    });

    it("should error if `--type` is used", async () => {
      const noValue = await runWrangler("init --type");
      expect(noValue.stderr).toMatchInlineSnapshot(
        `"The --type option is no longer supported."`
      );
    });

    it("should error if `--type javascript` is used", async () => {
      const javascriptValue = await runWrangler("init --type javascript");
      expect(javascriptValue.stderr).toMatchInlineSnapshot(
        `"The --type option is no longer supported."`
      );
    });

    it("should error if `--type rust` is used", async () => {
      const rustValue = await runWrangler("init --type rust");
      expect(rustValue.stderr).toMatchInlineSnapshot(
        `"The --type option is no longer supported."`
      );
    });

    it("should error if `--type webpack` is used", async () => {
      const webpackValue = await runWrangler("init --type webpack");
      expect(webpackValue.stderr).toMatchInlineSnapshot(`
        "The --type option is no longer supported.
        If you wish to use webpack then you will need to create a custom build."
      `);
    });
  });
});
