import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as TOML from "@iarna/toml";
import { version as wranglerVersion } from "../../package.json";
import { getPackageManager } from "../package-manager";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { PackageManager } from "../package-manager";

describe("wrangler", () => {
  let mockPackageManager: PackageManager;
  runInTempDir();

  beforeEach(() => {
    mockPackageManager = {
      addDevDeps: jest.fn(),
      install: jest.fn(),
    };
    (getPackageManager as jest.Mock).mockResolvedValue(mockPackageManager);
  });

  const std = mockConsoleMethods();

  describe("no command", () => {
    it("should display a list of available commands", async () => {
      await runWrangler();

      expect(std.out).toMatchInlineSnapshot(`
        "wrangler

        Commands:
          wrangler init [name]       📥 Create a wrangler.toml configuration file
          wrangler whoami            🕵️  Retrieve your user info and test your auth config
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

      expect(std.err).toMatchInlineSnapshot(`""`);
    });
  });

  describe("invalid command", () => {
    it("should display an error", async () => {
      await expect(
        runWrangler("invalid-command")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Unknown command: invalid-command."`
      );

      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`
        "wrangler

        Commands:
          wrangler init [name]       📥 Create a wrangler.toml configuration file
          wrangler whoami            🕵️  Retrieve your user info and test your auth config
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
          -l, --local  Run on my machine  [boolean] [default: false]

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
      fs.writeFileSync(
        "./wrangler.toml",
        'compatibility_date="something-else"', // use a fake value to make sure the file is not overwritten
        "utf-8"
      );
      mockConfirm({
        text: "Do you want to continue initializing this project?",
        result: false,
      });
      await runWrangler("init");
      expect(std.warn).toContain("wrangler.toml file already exists!");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(parsed.compatibility_date).toBe("something-else");
    });

    it("should display warning when wrangler.toml already exists, but continue if user does want to carry on", async () => {
      fs.writeFileSync(
        "./wrangler.toml",
        `compatibility_date="something-else"`,
        "utf-8"
      );
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
      await runWrangler("init");
      expect(std.warn).toContain("wrangler.toml file already exists!");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(parsed.compatibility_date).toBe("something-else");
    });

    it("should create a package.json if none is found and user confirms", async () => {
      mockConfirm(
        {
          text: "No package.json found. Would you like to create one?",
          result: true,
        },
        {
          text: "Would you like to use TypeScript?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at src/index.js?",
          result: false,
        }
      );
      await runWrangler("init");
      expect(fs.existsSync("./package.json")).toBe(true);
      const packageJson = JSON.parse(
        fs.readFileSync("./package.json", "utf-8")
      );
      expect(packageJson.name).toEqual("worker"); // TODO: should we infer the name from the directory?
      expect(packageJson.version).toEqual("0.0.0");
      expect(packageJson.devDependencies).toEqual({
        wrangler: expect.any(String),
      });
      expect(fs.existsSync("./tsconfig.json")).toBe(false);
      expect(mockPackageManager.install).toHaveBeenCalled();
    });

    it("should not touch an existing package.json in the same directory", async () => {
      mockConfirm(
        {
          text: "Would you like to install wrangler into your package.json?",
          result: false,
        },
        {
          text: "Would you like to use TypeScript?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at src/index.js?",
          result: false,
        }
      );

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

    it("should offer to install wrangler into an existing package.json", async () => {
      mockConfirm(
        {
          text: "Would you like to install wrangler into your package.json?",
          result: true,
        },
        {
          text: "Would you like to use TypeScript?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at src/index.js?",
          result: false,
        }
      );

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
      expect(mockPackageManager.addDevDeps).toHaveBeenCalledWith(
        `wrangler@${wranglerVersion}`
      );
    });

    it("should not touch an existing package.json in an ancestor directory", async () => {
      mockConfirm(
        {
          text: "Would you like to install wrangler into your package.json?",
          result: false,
        },
        {
          text: "Would you like to use TypeScript?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at src/index.js?",
          result: false,
        }
      );

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
      expect(packageJson).toMatchInlineSnapshot(`
        Object {
          "name": "test",
          "version": "1.0.0",
        }
      `);
    });

    it("should offer to create a worker in a non-typescript project", async () => {
      mockConfirm(
        {
          text: "Would you like to install wrangler into your package.json?",
          result: false,
        },
        {
          text: "Would you like to use TypeScript?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at src/index.js?",
          result: true,
        }
      );

      fs.writeFileSync(
        "./package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );

      await runWrangler("init");
      expect(fs.existsSync("./src/index.js")).toBe(true);
      expect(fs.existsSync("./src/index.ts")).toBe(false);
    });

    it("should offer to create a worker in a typescript project", async () => {
      mockConfirm(
        {
          text: "Would you like to install wrangler into your package.json?",
          result: false,
        },
        {
          text: "Would you like to use TypeScript?",
          result: true,
        },
        {
          text: "Would you like to create a Worker at src/index.ts?",
          result: true,
        }
      );

      fs.writeFileSync(
        "./package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );

      await runWrangler("init");
      expect(fs.existsSync("./src/index.js")).toBe(false);
      expect(fs.existsSync("./src/index.ts")).toBe(true);
    });

    it("should not offer to create a worker in a non-ts project if a file already exists at the location", async () => {
      mockConfirm(
        {
          text: "Would you like to install wrangler into your package.json?",
          result: false,
        },
        {
          text: "Would you like to use TypeScript?",
          result: false,
        }
      );

      fs.writeFileSync(
        "./package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );
      fs.mkdirSync("./src", { recursive: true });
      const PLACEHOLDER = "/* placeholder text */";
      fs.writeFileSync("./src/index.js", PLACEHOLDER, "utf-8");

      await runWrangler("init");
      expect(fs.readFileSync("./src/index.js", "utf-8")).toBe(PLACEHOLDER);
      expect(fs.existsSync("./src/index.ts")).toBe(false);
    });

    it("should not offer to create a worker in a ts project if a file already exists at the location", async () => {
      mockConfirm(
        {
          text: "Would you like to install wrangler into your package.json?",
          result: false,
        },
        {
          text: "Would you like to use TypeScript?",
          result: true,
        }
      );

      fs.writeFileSync(
        "./package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );
      fs.mkdirSync("./src", { recursive: true });
      const PLACEHOLDER = "/* placeholder text */";
      fs.writeFileSync("./src/index.ts", PLACEHOLDER, "utf-8");

      await runWrangler("init");
      expect(fs.existsSync("./src/index.js")).toBe(false);
      expect(fs.readFileSync("./src/index.ts", "utf-8")).toBe(PLACEHOLDER);
    });

    it("should create a tsconfig.json and install `workers-types` if none is found and user confirms", async () => {
      mockConfirm(
        {
          text: "No package.json found. Would you like to create one?",
          result: true,
        },
        {
          text: "Would you like to use TypeScript?",
          result: true,
        },
        {
          text: "Would you like to create a Worker at src/index.ts?",
          result: false,
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
      expect(mockPackageManager.addDevDeps).toHaveBeenCalledWith(
        "@cloudflare/workers-types",
        "typescript"
      );
    });

    it("should not touch an existing tsconfig.json in the same directory", async () => {
      fs.writeFileSync(
        "./package.json",
        JSON.stringify({
          name: "test",
          version: "1.0.0",
          devDependencies: {
            wrangler: "0.0.0",
            "@cloudflare/workers-types": "0.0.0",
          },
        }),
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

    it("should offer to install type definitions in an existing typescript project", async () => {
      mockConfirm(
        {
          text: "Would you like to install wrangler into your package.json?",
          result: false,
        },
        {
          text: "Would you like to install the type definitions for Workers into your package.json?",
          result: true,
        },
        {
          text: "Would you like to create a Worker at src/index.ts?",
          result: false,
        }
      );
      fs.writeFileSync(
        "./package.json",
        JSON.stringify({
          name: "test",
          version: "1.0.0",
        }),
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
      // unchanged tsconfig
      expect(tsconfigJson.compilerOptions).toEqual({});
      expect(mockPackageManager.addDevDeps).toHaveBeenCalledWith(
        "@cloudflare/workers-types"
      );
    });

    it("should not touch an existing tsconfig.json in an ancestor directory", async () => {
      fs.writeFileSync(
        "./package.json",
        JSON.stringify({
          name: "test",
          version: "1.0.0",
          devDependencies: {
            wrangler: "0.0.0",
            "@cloudflare/workers-types": "0.0.0",
          },
        }),
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
      await expect(
        runWrangler("init --type")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"The --type option is no longer supported."`
      );
    });

    it("should error if `--type javascript` is used", async () => {
      await expect(
        runWrangler("init --type javascript")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"The --type option is no longer supported."`
      );
    });

    it("should error if `--type rust` is used", async () => {
      await expect(
        runWrangler("init --type rust")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"The --type option is no longer supported."`
      );
    });

    it("should error if `--type webpack` is used", async () => {
      await expect(runWrangler("init --type webpack")).rejects
        .toThrowErrorMatchingInlineSnapshot(`
              "The --type option is no longer supported.
              If you wish to use webpack then you will need to create a custom build."
            `);
    });
  });
});
