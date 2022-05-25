import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import * as TOML from "@iarna/toml";
import { execa, execaSync } from "execa";
import { parseConfigFileTextToJson } from "typescript";
import { version as wranglerVersion } from "../../package.json";
import { getPackageManager } from "../package-manager";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm, clearConfirmMocks } from "./helpers/mock-dialogs";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { PackageManager } from "../package-manager";

describe("init", () => {
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

  afterEach(() => {
    clearConfirmMocks();
  });

  const std = mockConsoleMethods();

  describe("options", () => {
    it("should initialize with no interactive prompts if `--yes` is used", async () => {
      await runWrangler("init --yes");

      expect(fs.existsSync("./src/index.js")).toBe(false);
      expect(fs.existsSync("./src/index.ts")).toBe(true);
      expect(fs.existsSync("./tsconfig.json")).toBe(true);
      expect(fs.existsSync("./package.json")).toBe(true);
      expect(fs.existsSync("./wrangler.toml")).toBe(true);
      expect(std.out).toMatchInlineSnapshot(`
        "✨ Created wrangler.toml
        ✨ Initialized git repository
        ✨ Created package.json
        ✨ Created tsconfig.json
        ✨ Created src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

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
        "✨ Created my-worker/wrangler.toml
        ✨ Initialized git repository at my-worker
        ✨ Created my-worker/package.json
        ✨ Created my-worker/tsconfig.json
        ✨ Created my-worker/src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Initialized git repository
        ✨ Created package.json
        ✨ Created tsconfig.json
        ✨ Created src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

        To start developing your Worker, run \`npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`",
          "warn": "",
        }
      `);
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

    it("should error if `--site` is used", async () => {
      await expect(runWrangler("init --site")).rejects
        .toThrowErrorMatchingInlineSnapshot(`
              "The --site option is no longer supported.
              If you wish to create a brand new Worker Sites project then clone the \`worker-sites-template\` starter repository:

              \`\`\`
              git clone --depth=1 --branch=wrangler2 https://github.com/cloudflare/worker-sites-template my-site
              cd my-site
              \`\`\`

              Find out more about how to create and maintain Sites projects at https://developers.cloudflare.com/workers/platform/sites.
              Have you considered using Cloudflare Pages instead? See https://pages.cloudflare.com/."
            `);
    });
  });

  describe("wrangler.toml", () => {
    it("should create a wrangler.toml", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "No package.json found. Would you like to create one?",
          result: false,
        }
      );
      await runWrangler("init");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(typeof parsed.compatibility_date).toBe("string");
      expect(parsed.name).toContain("wrangler-tests");
      expect(fs.existsSync("./package.json")).toBe(false);
      expect(fs.existsSync("./tsconfig.json")).toBe(false);
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml",
          "warn": "",
        }
      `);
    });

    it("should create a wrangler.toml and a directory for a named Worker ", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "No package.json found. Would you like to create one?",
          result: false,
        }
      );
      await runWrangler("init my-worker");
      const parsed = TOML.parse(
        await fsp.readFile("./my-worker/wrangler.toml", "utf-8")
      );
      expect(typeof parsed.compatibility_date).toBe("string");
      expect(parsed.name).toBe("my-worker");
      expect(fs.existsSync("./my-worker/package.json")).toBe(false);
      expect(fs.existsSync("./my-worker/tsconfig.json")).toBe(false);

      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created my-worker/wrangler.toml",
          "warn": "",
        }
      `);
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
      expect(std.warn).toContain("wrangler.toml already exists!");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(parsed.compatibility_date).toBe("something-else");

      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "",
          "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mwrangler.toml already exists![0m

        ",
        }
      `);
    });

    it("should display warning when wrangler.toml already exists in the target directory, and exit if user does not want to carry on", async () => {
      fs.mkdirSync("path/to/worker", { recursive: true });
      fs.writeFileSync(
        "path/to/worker/wrangler.toml",
        'compatibility_date="something-else"', // use a fake value to make sure the file is not overwritten
        "utf-8"
      );
      mockConfirm({
        text: "Do you want to continue initializing this project?",
        result: false,
      });
      await runWrangler("init path/to/worker");
      expect(std.warn).toContain("wrangler.toml already exists!");
      const parsed = TOML.parse(
        await fsp.readFile("path/to/worker/wrangler.toml", "utf-8")
      );
      expect(parsed.compatibility_date).toBe("something-else");
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "",
          "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mpath/to/worker/wrangler.toml already exists![0m

        ",
        }
      `);
    });

    it("should not overwrite an existing wrangler.toml, after agreeing to other prompts", async () => {
      fs.writeFileSync(
        "./wrangler.toml",
        'compatibility_date="something-else"', // use a fake value to make sure the file is not overwritten
        "utf-8"
      );
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: true,
        },
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
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "No package.json found. Would you like to create one?",
          result: false,
        }
      );
      await runWrangler("init");
      expect(std.warn).toContain("wrangler.toml already exists!");
      const parsed = TOML.parse(await fsp.readFile("./wrangler.toml", "utf-8"));
      expect(parsed.compatibility_date).toBe("something-else");
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "",
          "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mwrangler.toml already exists![0m

        ",
        }
      `);
    });
  });

  describe("git init", () => {
    it("should offer to initialize a git repository", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: true,
        },
        {
          text: "No package.json found. Would you like to create one?",
          result: false,
        }
      );
      await runWrangler("init");
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Initialized git repository",
          "warn": "",
        }
      `);
      expect(fs.lstatSync(".git").isDirectory()).toBe(true);
      expect(fs.lstatSync(".gitignore").isFile()).toBe(true);
    });

    it("should not offer to initialize a git repo if it's already inside one", async () => {
      await execa("git", ["init"]);
      fs.mkdirSync("some-folder");
      process.chdir("some-folder");
      await runWrangler("init -y");

      // Note the lack of "✨ Initialized git repository" in the log
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Created package.json
        ✨ Created tsconfig.json
        ✨ Created src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

        To start developing your Worker, run \`npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`",
          "warn": "",
        }
      `);
    });

    it("should not offer to initialize a git repo if it's already inside one (when using a path as name)", async () => {
      fs.mkdirSync("path/to/worker", { recursive: true });
      await execa("git", ["init"], { cwd: "path/to/worker" });
      expect(fs.lstatSync("path/to/worker/.git").isDirectory()).toBe(true);

      await runWrangler("init path/to/worker/my-worker -y");

      // Note the lack of "✨ Initialized git repository" in the log
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created path/to/worker/my-worker/wrangler.toml
        ✨ Created path/to/worker/my-worker/package.json
        ✨ Created path/to/worker/my-worker/tsconfig.json
        ✨ Created path/to/worker/my-worker/src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

        To start developing your Worker, run \`cd path/to/worker/my-worker && npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`",
          "warn": "",
        }
      `);
    });

    // I... don't know how to test this lol
    it.todo(
      "should not offer to initialize a git repo if git is not installed"
    );

    it("should initialize git repo with `main` default branch", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: true,
        },
        {
          text: "No package.json found. Would you like to create one?",
          result: false,
        }
      );
      await runWrangler("init");
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Initialized git repository",
          "warn": "",
        }
      `);

      expect(execaSync("git", ["symbolic-ref", "HEAD"]).stdout).toEqual(
        "refs/heads/main"
      );
    });
  });

  describe("package.json", () => {
    it("should create a package.json if none is found and user confirms", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Created package.json",
          "warn": "",
        }
      `);
    });

    it("should create a package.json, with the specified name, if none is found and user confirms", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "No package.json found. Would you like to create one?",
          result: true,
        },
        {
          text: "Would you like to use TypeScript?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at my-worker/src/index.js?",
          result: false,
        }
      );
      await runWrangler("init my-worker");
      const packageJson = JSON.parse(
        fs.readFileSync("./my-worker/package.json", "utf-8")
      );
      expect(packageJson.name).toBe("my-worker");
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created my-worker/wrangler.toml
        ✨ Created my-worker/package.json",
          "warn": "",
        }
      `);
    });

    it("should not touch an existing package.json in the same directory", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml",
          "warn": "",
        }
      `);
    });

    it("should not touch an existing package.json in a target directory", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into path/to/worker/package.json?",
          result: false,
        },
        {
          text: "Would you like to use TypeScript?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at path/to/worker/my-worker/src/index.js?",
          result: false,
        }
      );

      fs.mkdirSync("path/to/worker", { recursive: true });
      fs.writeFileSync(
        "path/to/worker/package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );

      await runWrangler("init path/to/worker/my-worker");
      const packageJson = JSON.parse(
        fs.readFileSync("path/to/worker/package.json", "utf-8")
      );
      expect(packageJson.name).toEqual("test");
      expect(packageJson.version).toEqual("1.0.0");
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created path/to/worker/my-worker/wrangler.toml",
          "warn": "",
        }
      `);
    });

    it("should offer to install wrangler into an existing package.json", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Installed wrangler into devDependencies",
          "warn": "",
        }
      `);
    });

    it("should offer to install wrangler into a package.json relative to the target directory", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into path/to/worker/package.json?",
          result: true,
        },
        {
          text: "Would you like to use TypeScript?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at path/to/worker/my-worker/src/index.js?",
          result: false,
        }
      );

      fs.mkdirSync("path/to/worker", { recursive: true });
      fs.writeFileSync(
        "path/to/worker/package.json",
        JSON.stringify({ name: "test", version: "1.0.0" }),
        "utf-8"
      );

      await runWrangler("init path/to/worker/my-worker");
      const packageJson = JSON.parse(
        fs.readFileSync("path/to/worker/package.json", "utf-8")
      );
      expect(packageJson.name).toEqual("test");
      expect(packageJson.version).toEqual("1.0.0");
      expect(mockPackageManager.addDevDeps).toHaveBeenCalledWith(
        `wrangler@${wranglerVersion}`
      );
      expect(mockPackageManager.cwd).toBe(process.cwd());
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created path/to/worker/my-worker/wrangler.toml
        ✨ Installed wrangler into devDependencies",
          "warn": "",
        }
      `);
    });

    it("should not touch an existing package.json in an ancestor directory", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into ../../package.json?",
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml",
          "warn": "",
        }
      `);
    });
  });

  describe("typescript", () => {
    it("should offer to create a worker in a non-typescript project", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Created src/index.js

        To start developing your Worker, run \`npx wrangler dev\`
        To publish your Worker to the Internet, run \`npx wrangler publish\`",
          "warn": "",
        }
      `);
    });

    it("should offer to create a worker in a typescript project", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Created tsconfig.json
        ✨ Created src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

        To start developing your Worker, run \`npx wrangler dev\`
        To publish your Worker to the Internet, run \`npx wrangler publish\`",
          "warn": "",
        }
      `);
    });

    it("should add scripts for a typescript project with .ts extension", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "No package.json found. Would you like to create one?",
          result: true,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
        "✨ Created wrangler.toml
        ✨ Created package.json
        ✨ Created tsconfig.json
        ✨ Created src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

        To start developing your Worker, run \`npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`"
      `);
    });

    it("should not overwrite package.json scripts for a typescript project", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
        "✨ Created wrangler.toml
        ✨ Created tsconfig.json
        ✨ Created src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

        To start developing your Worker, run \`npx wrangler dev\`
        To publish your Worker to the Internet, run \`npx wrangler publish\`"
      `);
    });

    it("should not offer to create a worker in a ts project if a file already exists at the location", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Created tsconfig.json
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies",
          "warn": "",
        }
      `);
    });

    it("should not offer to create a worker in a ts project for a named worker if a file already exists at the location", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
      fs.mkdirSync("./my-worker/src", { recursive: true });
      const PLACEHOLDER = "/* placeholder text */";
      fs.writeFileSync("./my-worker/src/index.ts", PLACEHOLDER, "utf-8");

      await runWrangler("init my-worker");
      expect(fs.existsSync("./my-worker/src/index.js")).toBe(false);
      expect(fs.readFileSync("./my-worker/src/index.ts", "utf-8")).toBe(
        PLACEHOLDER
      );
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created my-worker/wrangler.toml
        ✨ Created my-worker/tsconfig.json
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies",
          "warn": "",
        }
      `);
    });

    it("should create a tsconfig.json and install `workers-types` if none is found and user confirms", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Created package.json
        ✨ Created tsconfig.json
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies",
          "warn": "",
        }
      `);
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

      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at src/index.ts?",
          result: true,
        }
      );

      await runWrangler("init");
      const tsconfigJson = JSON.parse(
        fs.readFileSync("./tsconfig.json", "utf-8")
      );
      expect(tsconfigJson.compilerOptions).toEqual({});
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Created src/index.ts

        To start developing your Worker, run \`npx wrangler dev\`
        To publish your Worker to the Internet, run \`npx wrangler publish\`",
          "warn": "",
        }
      `);
    });

    it("should not touch an existing tsconfig.json in the ancestor of a target directory", async () => {
      fs.mkdirSync("path/to/worker", { recursive: true });
      fs.writeFileSync(
        "path/to/worker/package.json",
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
        "path/to/worker/tsconfig.json",
        JSON.stringify({ compilerOptions: {} }),
        "utf-8"
      );

      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at path/to/worker/my-worker/src/index.ts?",
          result: true,
        }
      );

      await runWrangler("init path/to/worker/my-worker");
      const tsconfigJson = JSON.parse(
        fs.readFileSync("path/to/worker/tsconfig.json", "utf-8")
      );
      expect(tsconfigJson.compilerOptions).toEqual({});
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created path/to/worker/my-worker/wrangler.toml
        ✨ Created path/to/worker/my-worker/src/index.ts

        To start developing your Worker, run \`npx wrangler dev\`
        To publish your Worker to the Internet, run \`npx wrangler publish\`",
          "warn": "",
        }
      `);
    });

    it("should offer to install type definitions in an existing typescript project", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Installed @cloudflare/workers-types into devDependencies
        🚨 Please add \\"@cloudflare/workers-types\\" to compilerOptions.types in tsconfig.json",
          "warn": "",
        }
      `);
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

      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to create a Worker at src/index.ts?",
          result: true,
        }
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

      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Created src/index.ts

        To start developing your Worker, run \`npx wrangler dev\`
        To publish your Worker to the Internet, run \`npx wrangler publish\`",
          "warn": "",
        }
      `);
    });
  });

  describe("javascript", () => {
    it("should add missing scripts for a non-ts project with .js extension", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "No package.json found. Would you like to create one?",
          result: true,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
        "✨ Created wrangler.toml
        ✨ Created package.json
        ✨ Created src/index.js

        To start developing your Worker, run \`npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`"
      `);
    });

    it("should not overwrite package.json scripts for a non-ts project with .js extension", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
        "✨ Created wrangler.toml
        ✨ Created src/index.js

        To start developing your Worker, run \`npx wrangler dev\`
        To publish your Worker to the Internet, run \`npx wrangler publish\`"
      `);
    });

    it("should not offer to create a worker in a non-ts project if a file already exists at the location", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml",
          "warn": "",
        }
      `);
    });

    it("should not offer to create a worker in a non-ts named worker project if a file already exists at the location", async () => {
      mockConfirm(
        {
          text: "Would you like to use git to manage this Worker?",
          result: false,
        },
        {
          text: "Would you like to install wrangler into package.json?",
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
      fs.mkdirSync("./my-worker/src", { recursive: true });
      const PLACEHOLDER = "/* placeholder text */";
      fs.writeFileSync("./my-worker/src/index.js", PLACEHOLDER, "utf-8");

      await runWrangler("init my-worker");
      expect(fs.readFileSync("./my-worker/src/index.js", "utf-8")).toBe(
        PLACEHOLDER
      );
      expect(fs.existsSync("./my-worker/src/index.ts")).toBe(false);
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created my-worker/wrangler.toml",
          "warn": "",
        }
      `);
    });
  });

  describe("worker names", () => {
    it("should create a worker with a given name", async () => {
      await runWrangler("init my-worker -y");

      const parsed = TOML.parse(
        await fsp.readFile("./my-worker/wrangler.toml", "utf-8")
      );

      expect(typeof parsed.compatibility_date).toBe("string");
      expect(parsed.name).toBe("my-worker");
    });

    it('should create a worker with the name of the current directory if "name" is .', async () => {
      await runWrangler("init . -y");

      const parsed = TOML.parse(await fsp.readFile("wrangler.toml", "utf-8"));

      expect(typeof parsed.compatibility_date).toBe("string");
      expect(parsed.name).toBe(path.basename(process.cwd()).toLowerCase());
      expect(fs.existsSync("./my-worker/package.json")).toBe(false);
      expect(fs.existsSync("./my-worker/tsconfig.json")).toBe(false);
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created wrangler.toml
        ✨ Initialized git repository
        ✨ Created package.json
        ✨ Created tsconfig.json
        ✨ Created src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

        To start developing your Worker, run \`npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`",
          "warn": "",
        }
      `);
    });

    it('should create a worker in a nested directory if "name" is path/to/worker', async () => {
      await runWrangler("init path/to/worker -y");

      const parsed = TOML.parse(
        await fsp.readFile("path/to/worker/wrangler.toml", "utf-8")
      );

      expect(typeof parsed.compatibility_date).toBe("string");
      expect(parsed.name).toBe("worker");
      expect(fs.existsSync("./my-worker/package.json")).toBe(false);
      expect(fs.existsSync("./my-worker/tsconfig.json")).toBe(false);
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created path/to/worker/wrangler.toml
        ✨ Initialized git repository at path/to/worker
        ✨ Created path/to/worker/package.json
        ✨ Created path/to/worker/tsconfig.json
        ✨ Created path/to/worker/src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

        To start developing your Worker, run \`cd path/to/worker && npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`",
          "warn": "",
        }
      `);
    });

    it("should normalize characters that aren't lowercase alphanumeric, underscores, or dashes", async () => {
      await runWrangler("init WEIRD_w0rkr_N4m3.js.tsx.tar.gz -y");
      const parsed = TOML.parse(
        await fsp.readFile(
          "WEIRD_w0rkr_N4m3.js.tsx.tar.gz/wrangler.toml",
          "utf-8"
        )
      );

      expect(typeof parsed.compatibility_date).toBe("string");
      expect(parsed.name).toBe("weird_w0rkr_n4m3-js-tsx-tar-gz");
      expect(fs.existsSync("./my-worker/package.json")).toBe(false);
      expect(fs.existsSync("./my-worker/tsconfig.json")).toBe(false);
      expect(std).toMatchInlineSnapshot(`
        Object {
          "debug": "",
          "err": "",
          "out": "✨ Created WEIRD_w0rkr_N4m3.js.tsx.tar.gz/wrangler.toml
        ✨ Initialized git repository at WEIRD_w0rkr_N4m3.js.tsx.tar.gz
        ✨ Created WEIRD_w0rkr_N4m3.js.tsx.tar.gz/package.json
        ✨ Created WEIRD_w0rkr_N4m3.js.tsx.tar.gz/tsconfig.json
        ✨ Created WEIRD_w0rkr_N4m3.js.tsx.tar.gz/src/index.ts
        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

        To start developing your Worker, run \`cd WEIRD_w0rkr_N4m3.js.tsx.tar.gz && npm start\`
        To publish your Worker to the Internet, run \`npm run publish\`",
          "warn": "",
        }
      `);
    });
  });
});
