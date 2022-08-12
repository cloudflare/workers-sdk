import * as fs from "node:fs";
import path from "node:path";
import * as TOML from "@iarna/toml";
import { execa, execaSync } from "execa";
import { parseConfigFileTextToJson } from "typescript";
import { version as wranglerVersion } from "../../package.json";
import { getPackageManager } from "../package-manager";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockFetchDashScript, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import {
	mockConfirm,
	clearConfirmMocks,
	mockSelect,
	clearSelectMocks,
} from "./helpers/mock-dialogs";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { PackageManager } from "../package-manager";

/**
 * An expectation matcher for the minimal generated wrangler.toml.
 */
const MINIMAL_WRANGLER_TOML = {
	compatibility_date: expect.any(String),
	name: expect.stringContaining("wrangler-tests"),
	main: "src/index.ts",
};

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
		clearSelectMocks();
	});

	const std = mockConsoleMethods();

	describe("options", () => {
		it("should initialize with no interactive prompts if `--yes` is used", async () => {
			await runWrangler("init --yes");

			checkFiles({
				items: {
					"./src/index.js": false,
					"./src/index.ts": true,
					"./tsconfig.json": true,
					"./package.json": true,
					"./wrangler.toml": true,
				},
			});

			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Created wrangler.toml
			        ✨ Initialized git repository
			        ✨ Created package.json
			        ✨ Created tsconfig.json
			        ✨ Created src/index.ts
			        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

			        To start developing your Worker, run \`npm start\`
			        To publish your Worker to the Internet, run \`npm run deploy\`"
		      `);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should initialize with no interactive prompts if `--yes` is used (named worker)", async () => {
			await runWrangler("init my-worker --yes");

			checkFiles({
				items: {
					"./my-worker/src/index.js": false,
					"./my-worker/src/index.ts": true,
					"./my-worker/tsconfig.json": true,
					"./my-worker/package.json": true,
					"./my-worker/wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: "my-worker",
					}),
				},
			});

			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Created my-worker/wrangler.toml
			        ✨ Initialized git repository at my-worker
			        ✨ Created my-worker/package.json
			        ✨ Created my-worker/tsconfig.json
			        ✨ Created my-worker/src/index.ts
			        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

			        To start developing your Worker, run \`cd my-worker && npm start\`
			        To publish your Worker to the Internet, run \`npm run deploy\`"
		      `);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should initialize with no interactive prompts if `-y` is used", async () => {
			await runWrangler("init -y");

			checkFiles({
				items: {
					"./src/index.js": false,
					"./src/index.ts": true,
					"./tsconfig.json": true,
					"./package.json": true,
					"./wrangler.toml": true,
				},
			});

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
			        To publish your Worker to the Internet, run \`npm run deploy\`",
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
			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						compatibility_date: expect.any(String),
						name: expect.stringContaining("wrangler-tests"),
					}),
					"package.json": false,
					"tsconfig.json": false,
				},
			});

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

			checkFiles({
				items: {
					"my-worker/wrangler.toml": wranglerToml({
						compatibility_date: expect.any(String),
						name: "my-worker",
					}),
					"my-worker/package.json": false,
					"my-worker/tsconfig.json": false,
				},
			});

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
			writeFiles({
				items: {
					"wrangler.toml": wranglerToml({
						// use a fake value to make sure the file is not overwritten
						compatibility_date: "something-else",
					}),
				},
			});

			mockConfirm({
				text: "Do you want to continue initializing this project?",
				result: false,
			});

			await runWrangler("init");
			expect(std.warn).toContain("wrangler.toml already exists!");

			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						compatibility_date: "something-else",
					}),
					"package.json": false,
					"tsconfig.json": false,
				},
			});

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
			writeFiles({
				items: {
					"path/to/worker/wrangler.toml": wranglerToml({
						compatibility_date: "something-else",
					}),
				},
			});
			mockConfirm({
				text: "Do you want to continue initializing this project?",
				result: false,
			});

			await runWrangler("init path/to/worker");

			expect(std.warn).toContain("wrangler.toml already exists!");
			checkFiles({
				items: {
					"path/to/worker/wrangler.toml": wranglerToml({
						compatibility_date: "something-else",
					}),
					"package.json": false,
					"tsconfig.json": false,
				},
			});
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
			writeFiles({
				items: {
					"wrangler.toml": wranglerToml({
						compatibility_date: "something-else",
					}),
				},
			});
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
				}
			);

			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "fetch",
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						compatibility_date: "something-else",
					}),
				},
			});
		});

		it("should display warning when wrangler.toml already exists, but continue if user does want to carry on", async () => {
			writeFiles({
				items: {
					"wrangler.toml": wranglerToml({
						compatibility_date: "something-else",
					}),
				},
			});
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
			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						compatibility_date: "something-else",
					}),
				},
			});
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

		it("should not add a Cron Trigger to wrangler.toml when creating a Scheduled Worker if wrangler.toml already exists", async () => {
			writeFiles({
				items: {
					"wrangler.toml": wranglerToml({
						compatibility_date: "something-else",
					}),
				},
			});
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "scheduled",
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						compatibility_date: "something-else",
					}),
				},
			});
		});

		it("should add a Cron Trigger to wrangler.toml when creating a Scheduled Worker, but only if wrangler.toml is being created during init", async () => {
			mockConfirm(
				{
					text: "Would you like to use git to manage this Worker?",
					result: true,
				},
				{
					text: "No package.json found. Would you like to create one?",
					result: true,
				},
				{
					text: "Would you like to use TypeScript?",
					result: true,
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "scheduled",
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						triggers: { crons: ["1 * * * *"] },
					}),
				},
			});
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

			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						compatibility_date: expect.any(String),
						name: expect.stringContaining("wrangler-tests"),
					}),
					".git": { items: {} },
					".gitignore": true,
				},
			});
			expect(std).toMatchInlineSnapshot(`
			        Object {
			          "debug": "",
			          "err": "",
			          "out": "✨ Created wrangler.toml
			        ✨ Initialized git repository",
			          "warn": "",
			        }
		      `);
			expect((await execa("git", ["branch", "--show-current"])).stdout).toEqual(
				"main"
			);
		});

		it("should not offer to initialize a git repo if it's already inside one", async () => {
			await execa("git", ["init"]);
			setWorkingDirectory("some-folder");

			await runWrangler("init -y");

			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: "some-folder",
					}),
					".git": { items: {} },
					".gitignore": false,
				},
			});

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
			        To publish your Worker to the Internet, run \`npm run deploy\`",
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
			        To publish your Worker to the Internet, run \`npm run deploy\`",
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.js?",
				result: "none",
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"package.json": {
						contents: expect.objectContaining({
							name: expect.stringContaining("wrangler-tests"),
							version: "0.0.0",
							devDependencies: {
								wrangler: expect.any(String),
							},
						}),
					},
					"tsconfig.json": false,
				},
			});
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at my-worker/src/index.js?",
				result: "none",
			});

			await runWrangler("init my-worker");

			checkFiles({
				items: {
					"my-worker/package.json": {
						contents: expect.objectContaining({
							name: "my-worker",
							version: "0.0.0",
							devDependencies: {
								wrangler: expect.any(String),
							},
						}),
					},
					"my-worker/tsconfig.json": false,
				},
			});
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.js?",
				result: "none",
			});
			writeFiles({
				items: {
					"package.json": { contents: { name: "test", version: "1.0.0" } },
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"package.json": { contents: { name: "test", version: "1.0.0" } },
				},
			});
			expect(std).toMatchInlineSnapshot(`
			        Object {
			          "debug": "",
			          "err": "",
			          "out": "✨ Created wrangler.toml",
			          "warn": "",
			        }
		      `);
		});

		it("should not touch an existing package.json in an ancestor directory, when a name is passed", async () => {
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
					text: "Would you like to install wrangler into path/to/worker/my-worker/package.json?",
					result: false,
				},
				{
					text: "Would you like to use TypeScript?",
					result: false,
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at path/to/worker/my-worker/src/index.js?",
				result: "none",
			});
			writeFiles({
				items: {
					"path/to/worker/package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
				},
			});

			await runWrangler("init path/to/worker/my-worker");

			checkFiles({
				items: {
					"path/to/worker/package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
				},
			});
			expect(std).toMatchInlineSnapshot(`
			        Object {
			          "debug": "",
			          "err": "",
			          "out": "✨ Created path/to/worker/my-worker/wrangler.toml
			        ✨ Created path/to/worker/my-worker/package.json",
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.js?",
				result: "none",
			});
			writeFiles({
				items: {
					"package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
				},
			});
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

		it("should offer to install wrangler into a package.json relative to the target directory, if no name is provided", async () => {
			mockConfirm(
				{
					text: "Would you like to use git to manage this Worker?",
					result: false,
				},
				{
					text: "Would you like to install wrangler into ../package.json?",
					result: true,
				},
				{
					text: "Would you like to use TypeScript?",
					result: false,
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.js?",
				result: "none",
			});
			writeFiles({
				items: {
					"path/to/worker/package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
				},
			});
			setWorkingDirectory("path/to/worker/my-worker");

			await runWrangler("init");

			setWorkingDirectory("../../../..");
			checkFiles({
				items: {
					"path/to/worker/package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
					"path/to/worker/my-worker/package.json": false,
				},
			});
			expect(mockPackageManager.addDevDeps).toHaveBeenCalledWith(
				`wrangler@${wranglerVersion}`
			);
			expect(mockPackageManager.cwd).toBe(process.cwd());
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.js?",
				result: "none",
			});
			writeFiles({
				items: {
					"package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
				},
			});
			setWorkingDirectory("./sub-1/sub-2");

			await runWrangler("init");

			checkFiles({
				items: {
					"package.json": false,
					"../../package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
				},
			});
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.js?",
				result: "fetch",
			});
			writeFiles({
				items: {
					"package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						main: "src/index.js",
					}),
					"src/index.js": true,
					"src/index.ts": false,
				},
			});
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "fetch",
			});
			writeFiles({
				items: {
					"package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"src/index.js": false,
					"src/index.ts": true,
				},
			});
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "fetch",
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"package.json": {
						contents: expect.objectContaining({
							name: expect.stringContaining("wrangler-tests"),
							version: "0.0.0",
							scripts: {
								start: "wrangler dev",
								deploy: "wrangler publish",
							},
						}),
					},
					"src/index.js": false,
					"src/index.ts": true,
				},
			});
			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Created wrangler.toml
			        ✨ Created package.json
			        ✨ Created tsconfig.json
			        ✨ Created src/index.ts
			        ✨ Installed @cloudflare/workers-types and typescript into devDependencies

			        To start developing your Worker, run \`npm start\`
			        To publish your Worker to the Internet, run \`npm run deploy\`"
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "fetch",
			});
			writeFiles({
				items: {
					"package.json": {
						contents: {
							scripts: {
								start: "test-start",
								deploy: "test-publish",
							},
						},
					},
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"package.json": {
						contents: {
							scripts: {
								start: "test-start",
								deploy: "test-publish",
							},
						},
					},
					"src/index.js": false,
					"src/index.ts": true,
				},
			});
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
			const PLACEHOLDER = "/* placeholder text */";
			writeFiles({
				items: {
					"package.json": { contents: { name: "test", version: "1.0.0" } },
					"src/index.ts": { contents: PLACEHOLDER },
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"src/index.js": false,
					"src/index.ts": { contents: PLACEHOLDER },
				},
			});
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
				}
			);
			const PLACEHOLDER = "/* placeholder text */";
			writeFiles({
				items: {
					"package.json": { contents: { name: "test", version: "1.0.0" } },
					"my-worker/src/index.ts": { contents: PLACEHOLDER },
				},
			});

			await runWrangler("init my-worker");

			checkFiles({
				items: {
					"my-worker/src/index.js": false,
					"my-worker/src/index.ts": { contents: PLACEHOLDER },
				},
			});
			expect(std).toMatchInlineSnapshot(`
			        Object {
			          "debug": "",
			          "err": "",
			          "out": "✨ Created my-worker/wrangler.toml
			        ✨ Created my-worker/package.json
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "none",
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"tsconfig.json": {
						contents: {
							config: {
								compilerOptions: expect.objectContaining({
									types: ["@cloudflare/workers-types"],
								}),
							},
							error: undefined,
						},
					},
				},
			});
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
			mockConfirm({
				text: "Would you like to use git to manage this Worker?",
				result: false,
			});
			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "fetch",
			});
			writeFiles({
				items: {
					"package.json": {
						contents: {
							name: "test",
							version: "1.0.0",
							devDependencies: {
								wrangler: "0.0.0",
								"@cloudflare/workers-types": "0.0.0",
							},
						},
					},
					"tsconfig.json": { contents: { compilerOptions: {} } },
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"tsconfig.json": {
						contents: { config: { compilerOptions: {} }, error: undefined },
					},
				},
			});
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

		it("should not touch an existing tsconfig.json in the ancestor of a target directory, if a name is passed", async () => {
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at path/to/worker/my-worker/src/index.ts?",
				result: "fetch",
			});
			writeFiles({
				items: {
					"path/to/worker/package.json": {
						contents: {
							name: "test",
							version: "1.0.0",
							devDependencies: {
								wrangler: "0.0.0",
								"@cloudflare/workers-types": "0.0.0",
							},
						},
					},
					"path/to/worker/tsconfig.json": { contents: { compilerOptions: {} } },
				},
			});

			await runWrangler("init path/to/worker/my-worker");

			checkFiles({
				items: {
					"path/to/worker/tsconfig.json": {
						contents: { config: { compilerOptions: {}, error: undefined } },
					},
				},
			});
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
			        To publish your Worker to the Internet, run \`npm run deploy\`",
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "none",
			});
			writeFiles({
				items: {
					"./package.json": {
						contents: {
							name: "test",
							version: "1.0.0",
						},
					},
					"./tsconfig.json": { contents: { compilerOptions: {} } },
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					// unchanged tsconfig
					"tsconfig.json": { contents: { config: { compilerOptions: {} } } },
				},
			});
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
			mockConfirm({
				text: "Would you like to use git to manage this Worker?",
				result: false,
			});
			mockSelect({
				text: "Would you like to create a Worker at src/index.ts?",
				result: "fetch",
			});
			writeFiles({
				items: {
					"package.json": {
						contents: {
							name: "test",
							version: "1.0.0",
							devDependencies: {
								wrangler: "0.0.0",
								"@cloudflare/workers-types": "0.0.0",
							},
						},
					},
					"tsconfig.json": { contents: { compilerOptions: {} } },
				},
			});
			setWorkingDirectory("./sub-1/sub-2");

			await runWrangler("init");

			checkFiles({
				items: {
					"tsconfig.json": false,
					"../../tsconfig.json": {
						contents: { config: { compilerOptions: {} } },
					},
				},
			});
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.js?",
				result: "fetch",
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"src/index.js": true,
					"src/index.ts": false,
					"package.json": {
						contents: expect.objectContaining({
							name: expect.stringContaining("wrangler-tests"),
							version: "0.0.0",
							scripts: {
								start: "wrangler dev",
								deploy: "wrangler publish",
							},
						}),
					},
				},
			});
			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Created wrangler.toml
			        ✨ Created package.json
			        ✨ Created src/index.js

			        To start developing your Worker, run \`npm start\`
			        To publish your Worker to the Internet, run \`npm run deploy\`"
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
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at src/index.js?",
				result: "fetch",
			});
			writeFiles({
				items: {
					"package.json": {
						contents: {
							scripts: {
								start: "test-start",
								deploy: "test-publish",
							},
						},
					},
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"src/index.js": true,
					"src/index.ts": false,
					"package.json": {
						contents: expect.objectContaining({
							scripts: {
								start: "test-start",
								deploy: "test-publish",
							},
						}),
					},
				},
			});
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
			const PLACEHOLDER = "/* placeholder text */";
			writeFiles({
				items: {
					"package.json": { contents: { name: "test", version: "1.0.0" } },
					"src/index.js": { contents: PLACEHOLDER },
				},
			});

			await runWrangler("init");

			checkFiles({
				items: {
					"src/index.js": { contents: PLACEHOLDER },
					"src/index.ts": false,
				},
			});
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
					text: "Would you like to install wrangler into my-worker/package.json?",
					result: false,
				},
				{
					text: "Would you like to use TypeScript?",
					result: false,
				}
			);
			const PLACEHOLDER = "/* placeholder text */";
			writeFiles({
				items: {
					"my-worker/package.json": {
						contents: { name: "test", version: "1.0.0" },
					},
					"my-worker/src/index.js": { contents: PLACEHOLDER },
				},
			});

			await runWrangler("init my-worker");

			checkFiles({
				items: {
					"my-worker/src/index.js": { contents: PLACEHOLDER },
					"my-worker/src/index.ts": false,
				},
			});
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

			checkFiles({
				items: {
					"my-worker/wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: "my-worker",
					}),
				},
			});
		});

		it('should create a worker with the name of the current directory if "name" is .', async () => {
			await runWrangler("init . -y");

			const workerName = path.basename(process.cwd()).toLowerCase();
			checkFiles({
				items: {
					"wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: workerName,
					}),
				},
			});
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
			        To publish your Worker to the Internet, run \`npm run deploy\`",
			          "warn": "",
			        }
		      `);
		});

		it('should create a worker in a nested directory if "name" is path/to/worker', async () => {
			await runWrangler("init path/to/worker -y");

			checkFiles({
				items: {
					"path/to/worker/wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: "worker",
					}),
				},
			});
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
			        To publish your Worker to the Internet, run \`npm run deploy\`",
			          "warn": "",
			        }
		      `);
		});

		it("should normalize characters that aren't lowercase alphanumeric, underscores, or dashes", async () => {
			await runWrangler("init WEIRD_w0rkr_N4m3.js.tsx.tar.gz -y");

			checkFiles({
				items: {
					"WEIRD_w0rkr_N4m3.js.tsx.tar.gz/wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: "weird_w0rkr_n4m3-js-tsx-tar-gz",
					}),
				},
			});
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
			        To publish your Worker to the Internet, run \`npm run deploy\`",
			          "warn": "",
			        }
		      `);
		});

		it("should ignore ancestor files (such as wrangler.toml, package.json and tsconfig.json) if a name/path is given", async () => {
			mockConfirm(
				{
					text: "Would you like to use git to manage this Worker?",
					result: false,
				},
				{
					text: "Would you like to use TypeScript?",
					result: true,
				},
				{
					text: "No package.json found. Would you like to create one?",
					result: true,
				},
				{
					text: "Would you like to install the type definitions for Workers into your package.json?",
					result: true,
				}
			);
			mockSelect({
				text: "Would you like to create a Worker at sub/folder/worker/src/index.ts?",
				result: "fetch",
			});
			writeFiles({
				items: {
					"package.json": { contents: { name: "top-level" } },
					"tsconfig.json": { contents: { compilerOptions: {} } },
					"wrangler.toml": wranglerToml({
						name: "top-level",
						compatibility_date: "some-date",
					}),
				},
			});

			await runWrangler("init sub/folder/worker");

			// Ancestor files are untouched.
			checkFiles({
				items: {
					"package.json": { contents: { name: "top-level" } },
					"tsconfig.json": {
						contents: { config: { compilerOptions: {} }, error: undefined },
					},
					"wrangler.toml": wranglerToml({
						name: "top-level",
						compatibility_date: "some-date",
					}),
				},
			});
			// New initialized Worker has its own files.
			checkFiles({
				items: {
					"sub/folder/worker/package.json": {
						contents: expect.objectContaining({
							name: "worker",
						}),
					},
					"sub/folder/worker/tsconfig.json": true,
					"sub/folder/worker/wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: "worker",
					}),
				},
			});
		});
	});

	describe("from dashboard", () => {
		mockApiToken();
		mockAccountId({ accountId: "LCARS" });
		afterEach(() => {
			unsetAllMocks();
		});
		const mockDashboardScript = `
		export default {
			async fetch(request, env, ctx) {
				return new Response("Hello World!");
			},
		};
		`;

		//TODO: Tests for a case when a worker name doesn't exist - JACOB & CASS
		it("should download source script from dashboard w/ positional <name> in TypeScript project", async () => {
			setMockFetchDashScript({
				accountId: "LCARS",
				fromDashScriptName: "memory-crystal",
				mockResponse: mockDashboardScript,
			});
			mockConfirm(
				{
					text: "Would you like to use git to manage this Worker?",
					result: false,
				},
				{
					text: "Would you like to use TypeScript?",
					result: true,
				},
				{
					text: "No package.json found. Would you like to create one?",
					result: true,
				},
				{
					text: "Would you like to install the type definitions for Workers into your package.json?",
					result: true,
				}
			);

			await runWrangler(
				"init isolinear-optical-chip --from-dash memory-crystal"
			);

			checkFiles({
				items: {
					"isolinear-optical-chip/src/index.js": false,
					"isolinear-optical-chip/src/index.ts": {
						contents: mockDashboardScript,
					},
					"isolinear-optical-chip/package.json": {
						contents: expect.objectContaining({
							name: "isolinear-optical-chip",
						}),
					},
					"isolinear-optical-chip/tsconfig.json": true,
					"isolinear-optical-chip/wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: "isolinear-optical-chip",
					}),
				},
			});
		});

		it("should download source script from dashboard w/ out positional <name>", async () => {
			setMockFetchDashScript({
				accountId: "LCARS",
				fromDashScriptName: "isolinear-optical-chip",
				mockResponse: mockDashboardScript,
			});
			mockConfirm(
				{
					text: "Would you like to use git to manage this Worker?",
					result: false,
				},
				{
					text: "Would you like to use TypeScript?",
					result: true,
				},
				{
					text: "No package.json found. Would you like to create one?",
					result: true,
				},
				{
					text: "Would you like to install the type definitions for Workers into your package.json?",
					result: true,
				}
			);

			await runWrangler("init  --from-dash isolinear-optical-chip");

			checkFiles({
				items: {
					"isolinear-optical-chip/src/index.js": false,
					"isolinear-optical-chip/src/index.ts": {
						contents: mockDashboardScript,
					},
					"isolinear-optical-chip/package.json": {
						contents: expect.objectContaining({
							name: "isolinear-optical-chip",
						}),
					},
					"isolinear-optical-chip/tsconfig.json": true,
					"isolinear-optical-chip/wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: "isolinear-optical-chip",
					}),
				},
			});
		});

		it("should download source script from dashboard as plain JavaScript", async () => {
			setMockFetchDashScript({
				accountId: "LCARS",
				fromDashScriptName: "isolinear-optical-chip",
				mockResponse: mockDashboardScript,
			});
			mockConfirm(
				{
					text: "Would you like to use git to manage this Worker?",
					result: false,
				},
				{
					text: "Would you like to use TypeScript?",
					result: false,
				},
				{
					text: "No package.json found. Would you like to create one?",
					result: true,
				},
				{
					text: "Would you like to install the type definitions for Workers into your package.json?",
					result: true,
				}
			);

			await runWrangler("init  --from-dash isolinear-optical-chip");

			checkFiles({
				items: {
					"isolinear-optical-chip/src/index.js": {
						contents: mockDashboardScript,
					},
					"isolinear-optical-chip/src/index.ts": false,
					"isolinear-optical-chip/package.json": {
						contents: expect.objectContaining({
							name: "isolinear-optical-chip",
						}),
					},
					"isolinear-optical-chip/tsconfig.json": false,
					"isolinear-optical-chip/wrangler.toml": wranglerToml({
						...MINIMAL_WRANGLER_TOML,
						name: "isolinear-optical-chip",
					}),
				},
			});
		});

		it("should not continue if no worker name is provided", async () => {
			await expect(
				runWrangler("init  --from-dash")
			).rejects.toMatchInlineSnapshot(
				`[YError: Not enough arguments following: from-dash]`
			);
			checkFiles({
				items: {
					"isolinear-optical-chip/src/index.js": false,
					"isolinear-optical-chip/src/index.ts": false,
					"isolinear-optical-chip/package.json": false,
					"isolinear-optical-chip/tsconfig.json": false,
					"isolinear-optical-chip/wrangler.toml": false,
				},
			});
		});
	});
});

/**
 * Change the current working directory, ensuring that this exists.
 */
function setWorkingDirectory(directory: string) {
	fs.mkdirSync(directory, { recursive: true });
	process.chdir(directory);
}

/**
 * Write the given folder/files to disk at the given `cwd`.
 */
function writeFiles(folder: TestFolder, cwd = process.cwd()) {
	for (const name in folder.items) {
		const item = folder.items[name];
		const itemPath = path.resolve(cwd, name);
		if (typeof item !== "boolean") {
			if ("contents" in item) {
				fs.mkdirSync(path.dirname(itemPath), { recursive: true });
				fs.writeFileSync(itemPath, stringify(name, item.contents));
			} else {
				fs.mkdirSync(itemPath, { recursive: true });
				writeFiles(item, itemPath);
			}
		} else {
			throw new Error("Cannot write boolean flags to disk: " + itemPath);
		}
	}
}

/**
 * Check that the given test folders/files match what is in on disk.
 */
function checkFiles(folder: TestFolder, cwd = process.cwd()) {
	for (const name in folder.items) {
		const item = folder.items[name];
		const itemPath = path.resolve(cwd, name);
		if (typeof item === "boolean") {
			if (fs.existsSync(itemPath) !== item) {
				throw new Error(`Expected ${itemPath} ${item ? "" : "not "}to exist.`);
			}
		} else if ("contents" in item) {
			const actualContents = parse(name, fs.readFileSync(itemPath, "utf-8"));
			expect(actualContents).toEqual(item.contents);
		} else if ("items" in item) {
			checkFiles(item, itemPath);
		} else {
			throw new Error("Unexpected TestFile object.");
		}
	}
}

function stringify(name: string, value: unknown) {
	if (name.endsWith(".toml")) {
		return TOML.stringify(value as TOML.JsonMap);
	}
	if (name.endsWith(".json")) {
		return JSON.stringify(value);
	}
	return `${value}`;
}

function parse(name: string, value: string): unknown {
	if (name.endsWith(".toml")) {
		return TOML.parse(value);
	}
	if (name.endsWith("tsconfig.json")) {
		return parseConfigFileTextToJson(name, value);
	}
	if (name.endsWith(".json")) {
		return JSON.parse(value);
	}
	return value;
}

function wranglerToml(options: TOML.JsonMap = {}): TestFile {
	return {
		contents: options,
	};
}

interface TestFile {
	contents: unknown;
}
interface TestFolder {
	items: {
		[id: string]: TestFile | TestFolder | boolean;
	};
}
