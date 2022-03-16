import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as TOML from "@iarna/toml";
import { parseConfigFileTextToJson } from "typescript";
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
      cwd: process.cwd(),
      // @ts-expect-error we're making a fake package manager here
      type: "mockpm",
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
          wrangler dev [script]      👂 Start a local server for developing your worker
          wrangler publish [script]  🆙 Publish your Worker to Cloudflare.
          wrangler tail [name]       🦚 Starts a log tailing session for a published Worker.
          wrangler secret            🤫 Generate a secret that can be referenced in the worker script
          wrangler kv:namespace      🗂️  Interact with your Workers KV Namespaces
          wrangler kv:key            🔑 Individually manage Workers KV key-value pairs
          wrangler kv:bulk           💪 Interact with multiple Workers KV key-value pairs at once
          wrangler pages             ⚡️ Configure Cloudflare Pages
          wrangler r2                📦 Interact with an R2 store

        Flags:
          -c, --config      Path to .toml configuration file  [string]
          -h, --help        Show help  [boolean]
          -v, --version     Show version number  [boolean]
              --legacy-env  Use legacy environments  [boolean]"
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
          wrangler dev [script]      👂 Start a local server for developing your worker
          wrangler publish [script]  🆙 Publish your Worker to Cloudflare.
          wrangler tail [name]       🦚 Starts a log tailing session for a published Worker.
          wrangler secret            🤫 Generate a secret that can be referenced in the worker script
          wrangler kv:namespace      🗂️  Interact with your Workers KV Namespaces
          wrangler kv:key            🔑 Individually manage Workers KV key-value pairs
          wrangler kv:bulk           💪 Interact with multiple Workers KV key-value pairs at once
          wrangler pages             ⚡️ Configure Cloudflare Pages
          wrangler r2                📦 Interact with an R2 store

        Flags:
          -c, --config      Path to .toml configuration file  [string]
          -h, --help        Show help  [boolean]
          -v, --version     Show version number  [boolean]
              --legacy-env  Use legacy environments  [boolean]

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
      expect(parsed.name).toContain("wrangler-tests");
      expect(fs.existsSync("./package.json")).toBe(false);
      expect(fs.existsSync("./tsconfig.json")).toBe(false);
    });

    it("should create a wrangler.toml and a directory for a named Worker ", async () => {
      mockConfirm({
        text: "No package.json found. Would you like to create one?",
        result: false,
      });
      await runWrangler("init my-worker");
      const parsed = TOML.parse(
        await fsp.readFile("./my-worker/wrangler.toml", "utf-8")
      );
      expect(typeof parsed.compatibility_date).toBe("string");
      expect(parsed.name).toBe("my-worker");
      expect(fs.existsSync("./my-worker/package.json")).toBe(false);
      expect(fs.existsSync("./my-worker/tsconfig.json")).toBe(false);
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

    it("should not overwrite an existing wrangler.toml, after agreeing to other prompts", async () => {
      fs.writeFileSync(
        "./wrangler.toml",
        'compatibility_date="something-else"', // use a fake value to make sure the file is not overwritten
        "utf-8"
      );
      mockConfirm(
        {
          text: "Do you want to continue initializing this project?",
          result: true,
        },
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
          result: true,
        }
      );

      await runWrangler("init");
      expect(fs.readFileSync("./wrangler.toml", "utf-8")).toMatchInlineSnapshot(
        `"compatibility_date=\\"something-else\\""`
      );
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
      expect(packageJson.name).toContain("wrangler-tests");
      expect(packageJson.version).toEqual("0.0.0");
      expect(packageJson.devDependencies).toEqual({
        wrangler: expect.any(String),
      });
      expect(fs.existsSync("./tsconfig.json")).toBe(false);
      expect(mockPackageManager.install).toHaveBeenCalled();
    });

    it("should create a package.json, with the specified name, if none is found and user confirms", async () => {
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
      await runWrangler("init my-worker");
      const packageJson = JSON.parse(
        fs.readFileSync("./my-worker/package.json", "utf-8")
      );
      expect(packageJson.name).toBe("my-worker");
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

    it("should add scripts for a typescript project with .ts extension", async () => {
      mockConfirm(
        {
          text: "No package.json found. Would you like to create one?",
          result: true,
        },
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
      await runWrangler("init");

      expect(fs.existsSync("./package.json")).toBe(true);
      const packageJson = JSON.parse(
        fs.readFileSync("./package.json", "utf-8")
      );

      expect(fs.existsSync("./src/index.js")).toBe(false);
      expect(fs.existsSync("./src/index.ts")).toBe(true);

      expect(packageJson.scripts.start).toBe("wrangler dev");
      expect(packageJson.scripts.publish).toBe("wrangler publish");
      expect(packageJson.name).toContain("wrangler-tests");
      expect(packageJson.version).toEqual("0.0.0");
      expect(std.out).toMatchInlineSnapshot(`
        "✨ Successfully created wrangler.toml
        ✨ Created package.json
        ✨ Created tsconfig.json, installed @cloudflare/workers-types into devDependencies
        ✨ Created src/index.ts

        To start developing your Worker, run \`npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`"
      `);
    });

    it("should not overwrite package.json scripts for a typescript project", async () => {
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
      await fsp.writeFile(
        "./package.json",
        JSON.stringify({
          scripts: {
            start: "test-start",
            publish: "test-publish",
          },
        })
      );
      const packageJson = JSON.parse(
        fs.readFileSync("./package.json", "utf-8")
      );
      await runWrangler("init");

      expect(fs.existsSync("./src/index.js")).toBe(false);
      expect(fs.existsSync("./src/index.ts")).toBe(true);

      expect(packageJson.scripts.start).toBe("test-start");
      expect(packageJson.scripts.publish).toBe("test-publish");
      expect(std.out).toMatchInlineSnapshot(`
        "✨ Successfully created wrangler.toml
        ✨ Created tsconfig.json, installed @cloudflare/workers-types into devDependencies
        ✨ Created src/index.ts

        To start developing your Worker, run \`npx wrangler dev\`
        To publish your Worker to the Internet, run \`npx wrangler publish\`"
      `);
    });

    it("should add missing scripts for a non-ts project with .js extension", async () => {
      mockConfirm(
        {
          text: "No package.json found. Would you like to create one?",
          result: true,
        },
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
      await runWrangler("init");

      expect(fs.existsSync("./package.json")).toBe(true);
      const packageJson = JSON.parse(
        fs.readFileSync("./package.json", "utf-8")
      );

      expect(fs.existsSync("./src/index.js")).toBe(true);
      expect(fs.existsSync("./src/index.ts")).toBe(false);

      expect(packageJson.scripts.start).toBe("wrangler dev");
      expect(packageJson.scripts.publish).toBe("wrangler publish");
      expect(packageJson.name).toContain("wrangler-tests");
      expect(packageJson.version).toEqual("0.0.0");
      expect(std.out).toMatchInlineSnapshot(`
        "✨ Successfully created wrangler.toml
        ✨ Created package.json
        ✨ Created src/index.js

        To start developing your Worker, run \`npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`"
      `);
    });

    it("should not overwrite package.json scripts for a non-ts project with .js extension", async () => {
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
      await fsp.writeFile(
        "./package.json",
        JSON.stringify({
          scripts: {
            start: "test-start",
            publish: "test-publish",
          },
        })
      );
      const packageJson = JSON.parse(
        fs.readFileSync("./package.json", "utf-8")
      );
      await runWrangler("init");

      expect(fs.existsSync("./src/index.js")).toBe(true);
      expect(fs.existsSync("./src/index.ts")).toBe(false);

      expect(packageJson.scripts.start).toBe("test-start");
      expect(packageJson.scripts.publish).toBe("test-publish");
      expect(std.out).toMatchInlineSnapshot(`
        "✨ Successfully created wrangler.toml
        ✨ Created src/index.js

        To start developing your Worker, run \`npx wrangler dev\`
        To publish your Worker to the Internet, run \`npx wrangler publish\`"
      `);
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
      const { config: tsconfigJson, error: tsConfigParseError } =
        parseConfigFileTextToJson(
          "./tsconfig.json",
          fs.readFileSync("./tsconfig.json", "utf-8")
        );
      expect(tsConfigParseError).toBeUndefined();
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

    it("should initialize with no interactive prompts if `--yes` is used", async () => {
      await runWrangler("init --yes");

      expect(fs.existsSync("./src/index.js")).toBe(false);
      expect(fs.existsSync("./src/index.ts")).toBe(true);
      expect(fs.existsSync("./tsconfig.json")).toBe(true);
      expect(fs.existsSync("./package.json")).toBe(true);
      expect(fs.existsSync("./wrangler.toml")).toBe(true);
      expect(std.out).toMatchInlineSnapshot(`
        "✨ Successfully created wrangler.toml
        ✨ Created package.json
        ✨ Created tsconfig.json, installed @cloudflare/workers-types into devDependencies
        ✨ Created src/index.ts

        To start developing your Worker, run \`npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should initialize with no interactive prompts if `--yes` is used (named worker)", async () => {
      await runWrangler("init my-worker --yes");

      expect(fs.existsSync("./my-worker/src/index.js")).toBe(false);
      expect(fs.existsSync("./my-worker/src/index.ts")).toBe(true);
      expect(fs.existsSync("./my-worker/tsconfig.json")).toBe(true);
      expect(fs.existsSync("./my-worker/package.json")).toBe(true);
      expect(fs.existsSync("./my-worker/wrangler.toml")).toBe(true);
      const parsedWranglerToml = TOML.parse(
        fs.readFileSync("./my-worker/wrangler.toml", "utf-8")
      );
      expect(parsedWranglerToml.main).toEqual("src/index.ts");
      expect(std.out).toMatchInlineSnapshot(`
        "✨ Successfully created wrangler.toml
        ✨ Created package.json
        ✨ Created tsconfig.json, installed @cloudflare/workers-types into devDependencies
        ✨ Created src/index.ts

        To start developing your Worker, run \`cd my-worker && npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`"
      `);
      expect(std.err).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
    });

    it("should initialize with no interactive prompts if `-y` is used", async () => {
      await runWrangler("init -y");

      expect(fs.existsSync("./src/index.js")).toBe(false);
      expect(fs.existsSync("./src/index.ts")).toBe(true);
      expect(fs.existsSync("./tsconfig.json")).toBe(true);
      expect(fs.existsSync("./package.json")).toBe(true);
      expect(fs.existsSync("./wrangler.toml")).toBe(true);
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

  describe("preview", () => {
    it("should throw an error if the deprecated command is used with positional arguments", async () => {
      await expect(runWrangler("preview GET")).rejects
        .toThrowErrorMatchingInlineSnapshot(`
              "DEPRECATION WARNING:
              The \`wrangler preview\` command has been deprecated.
              Try using \`wrangler dev\` to to try out a worker during development.
              "
            `);
      await expect(runWrangler("preview GET 'Some Body'")).rejects
        .toThrowErrorMatchingInlineSnapshot(`
              "DEPRECATION WARNING:
              The \`wrangler preview\` command has been deprecated.
              Try using \`wrangler dev\` to to try out a worker during development.
              "
            `);
    });
  });

  describe("subcommand implicit help ran on imcomplete command execution", () => {
    function endEventLoop() {
      return new Promise((resolve) => setImmediate(resolve));
    }
    it("no subcommand for 'secret' should display a list of available subcommands", async () => {
      await runWrangler("secret");
      await endEventLoop();
      expect(std.out).toMatchInlineSnapshot(`
        "wrangler secret

        🤫 Generate a secret that can be referenced in the worker script

        Commands:
          wrangler secret put <key>     Create or update a secret variable for a script
          wrangler secret delete <key>  Delete a secret variable from a script
          wrangler secret list          List all secrets for a script

        Flags:
          -c, --config      Path to .toml configuration file  [string]
          -h, --help        Show help  [boolean]
          -v, --version     Show version number  [boolean]
              --legacy-env  Use legacy environments  [boolean]"
      `);
    });

    it("no subcommand 'kv:namespace' should display a list of available subcommands", async () => {
      await runWrangler("kv:namespace");
      await endEventLoop();
      expect(std.out).toMatchInlineSnapshot(`
         "wrangler kv:namespace

         🗂️  Interact with your Workers KV Namespaces

         Commands:
           wrangler kv:namespace create <namespace>  Create a new namespace
           wrangler kv:namespace list                Outputs a list of all KV namespaces associated with your account id.
           wrangler kv:namespace delete              Deletes a given namespace.

         Flags:
           -c, --config      Path to .toml configuration file  [string]
           -h, --help        Show help  [boolean]
           -v, --version     Show version number  [boolean]
               --legacy-env  Use legacy environments  [boolean]"
      `);
    });

    it("no subcommand 'kv:key' should display a list of available subcommands", async () => {
      await runWrangler("kv:key");
      await endEventLoop();
      expect(std.out).toMatchInlineSnapshot(`
               "wrangler kv:key

               🔑 Individually manage Workers KV key-value pairs

               Commands:
                 wrangler kv:key put <key> [value]  Writes a single key/value pair to the given namespace.
                 wrangler kv:key list               Outputs a list of all keys in a given namespace.
                 wrangler kv:key get <key>          Reads a single value by key from the given namespace.
                 wrangler kv:key delete <key>       Removes a single key value pair from the given namespace.

               Flags:
                 -c, --config      Path to .toml configuration file  [string]
                 -h, --help        Show help  [boolean]
                 -v, --version     Show version number  [boolean]
                     --legacy-env  Use legacy environments  [boolean]"
            `);
    });

    it("no subcommand 'kv:bulk' should display a list of available subcommands", async () => {
      await runWrangler("kv:bulk");
      await endEventLoop();
      expect(std.out).toMatchInlineSnapshot(`
               "wrangler kv:bulk

               💪 Interact with multiple Workers KV key-value pairs at once

               Commands:
                 wrangler kv:bulk put <filename>     Upload multiple key-value pairs to a namespace
                 wrangler kv:bulk delete <filename>  Delete multiple key-value pairs from a namespace

               Flags:
                 -c, --config      Path to .toml configuration file  [string]
                 -h, --help        Show help  [boolean]
                 -v, --version     Show version number  [boolean]
                     --legacy-env  Use legacy environments  [boolean]"
            `);
    });
    it("no subcommand 'r2' should display a list of available subcommands", async () => {
      await runWrangler("r2");
      await endEventLoop();
      expect(std.out).toMatchInlineSnapshot(`
               "wrangler r2

               📦 Interact with an R2 store

               Commands:
                 wrangler r2 bucket  Manage R2 buckets

               Flags:
                 -c, --config      Path to .toml configuration file  [string]
                 -h, --help        Show help  [boolean]
                 -v, --version     Show version number  [boolean]
                     --legacy-env  Use legacy environments  [boolean]"
            `);
    });
  });
  describe("Deprecated commands", () => {
    it("should print a deprecation message for 'generate'", async () => {
      await runWrangler("generate").catch((err) => {
        expect(err.message).toMatchInlineSnapshot(`
          "DEPRECATION WARNING:
          \`wrangler generate\` has been deprecated, please refer to https://github.com/cloudflare/wrangler2/blob/main/docs/deprecations.md#generate for alternatives"
        `);
      });
    });
    it("should print a deprecation message for 'build'", async () => {
      await runWrangler("build").catch((err) => {
        expect(err.message).toMatchInlineSnapshot(`
          "DEPRECATION WARNING:
          \`wrangler build\` has been deprecated, please refer to https://github.com/cloudflare/wrangler2/blob/main/docs/deprecations.md#build for alternatives"
        `);
      });
    });
  });
});
