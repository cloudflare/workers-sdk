import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
	normalizeString,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { logger } from "../../logger";
import {
	EXIT_CODE_INVALID_PAGES_CONFIG,
	EXIT_CODE_NO_CONFIG_FOUND,
} from "../../pages/errors";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("pages build env", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	afterEach(() => {
		logger.resetLoggerLevel();
	});
	beforeEach(() => {
		vi.stubEnv("PAGES_ENVIRONMENT", "production");
	});

	it("should render empty object", async ({ expect }) => {
		writeWranglerConfig({
			pages_build_output_dir: "./dist",
			vars: {},
		});
		await runWrangler("pages functions build-env . --outfile data.json");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.toml file. Reading build configuration...
			pages_build_output_dir: dist
			Build environment variables: (none found)"
		`);
		expect(readFileSync("data.json", "utf8")).toMatchInlineSnapshot(
			`"{"vars":{},"pages_build_output_dir":"dist"}"`
		);
	});

	it("should fail with no project dir", async ({ expect }) => {
		await expect(
			runWrangler("pages functions build-env")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: No Pages project location specified]`
		);
	});

	it("should fail with no outfile", async ({ expect }) => {
		await expect(
			runWrangler("pages functions build-env .")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: No outfile specified]`
		);
	});

	it("should exit with specific exit code if no config file is found", async ({
		expect,
	}) => {
		logger.loggerLevel = "debug";
		await runWrangler("pages functions build-env . --outfile out.json");

		expect(process.exitCode).toEqual(EXIT_CODE_NO_CONFIG_FOUND);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)
			"
		`);
		expect(std.debug).toContain(
			"No Wrangler configuration file found. Exiting."
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should exit with specific code if a non-pages config file is found", async ({
		expect,
	}) => {
		logger.loggerLevel = "debug";
		writeWranglerConfig({
			vars: {
				VAR1: "VALUE1",
				VAR2: "VALUE2",
				JSON: { json: true },
			},
			env: {
				production: {
					vars: {
						VAR1: "PROD_VALUE1",
						VAR2: "PROD_VALUE2",
						PROD_VAR3: "PROD_VALUE3",
						JSON: { json: true },
					},
				},
				preview: {
					vars: {
						VAR1: "PREVIEW_VALUE1",
						VAR2: "PREVIEW_VALUE2",
						PREVIEW_VAR3: "PREVIEW_VALUE3",
						JSON: { json: true },
					},
				},
			},
		});

		// This error is specifically handled by the caller of build-env
		await runWrangler("pages functions build-env . --outfile data.json");

		expect(process.exitCode).toEqual(EXIT_CODE_INVALID_PAGES_CONFIG);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.toml file. Reading build configuration..."
		`);
		expect(std.debug).toContain("wrangler.toml file is invalid. Exiting.");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should exit correctly with an unparseable non-pages config file", async ({
		expect,
	}) => {
		logger.loggerLevel = "debug";

		writeFileSync("./wrangler.toml", 'INVALID "FILE');
		// This error is specifically handled by the caller of build-env
		await runWrangler("pages functions build-env . --outfile data.json");

		expect(process.exitCode).toEqual(EXIT_CODE_INVALID_PAGES_CONFIG);
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid TOML document: incomplete key-value: cannot find end of key[0m

			    <cwd>/wrangler.toml:1:0:
			[37m      1 │ [32m[37mINVALID "FILE
			        ╵ [32m^[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.toml file. Reading build configuration..."
		`);
		expect(std.debug).toContain("wrangler.toml file is invalid. Exiting.");
	});

	it("should exit correctly with a non-pages config file w/ invalid environment", async ({
		expect,
	}) => {
		logger.loggerLevel = "debug";
		writeWranglerConfig({
			vars: {
				VAR1: "VALUE1",
				VAR2: "VALUE2",
				JSON: { json: true },
			},
			env: {
				other: {
					vars: {
						VAR1: "PROD_VALUE1",
						VAR2: "PROD_VALUE2",
						PROD_VAR3: "PROD_VALUE3",
						JSON: { json: true },
					},
				},
				staging: {
					vars: {
						VAR1: "PREVIEW_VALUE1",
						VAR2: "PREVIEW_VALUE2",
						PREVIEW_VAR3: "PREVIEW_VALUE3",
						JSON: { json: true },
					},
				},
			},
		});

		// This error is specifically handled by the caller of build-env
		await runWrangler("pages functions build-env . --outfile data.json");

		expect(process.exitCode).toEqual(EXIT_CODE_INVALID_PAGES_CONFIG);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.toml file. Reading build configuration..."
		`);
		expect(std.debug).toContain("wrangler.toml file is invalid. Exiting.");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should throw an error if an invalid pages confg file is found", async ({
		expect,
	}) => {
		writeWranglerConfig({
			pages_build_output_dir: "dist",
			vars: {
				VAR1: "VALUE1",
			},
			env: {
				staging: {
					vars: {
						VAR1: "PROD_VALUE1",
					},
				},
			},
		});

		await expect(runWrangler("pages functions build-env . --outfile data.json"))
			.rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: Running configuration file validation for Pages:
			  - Configuration file contains the following environment names that are not supported by Pages projects:
			    "staging".
			    The supported named-environments for Pages are "preview" and "production".]
		`);
	});

	it("should exit if an unparseable pages confg file is found", async ({
		expect,
	}) => {
		writeFileSync(
			"./wrangler.toml",
			`
		pages_build_output_dir = "./dist"
		name = "pages-is-awesome"
		compatibility_date = "2024-01-01"

		something that fails toml parsing
		`
		);

		await runWrangler("pages functions build-env . --outfile data.json");
		expect(process.exitCode).toEqual(EXIT_CODE_INVALID_PAGES_CONFIG);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.toml file. Reading build configuration..."
		`);
	});

	it("should return top-level by default", async ({ expect }) => {
		vi.stubEnv("PAGES_ENVIRONMENT", "");
		writeWranglerConfig({
			pages_build_output_dir: "./dist",
			vars: {
				VAR1: "VALUE1",
				VAR2: "VALUE2",
				JSON: { json: true },
			},
			env: {
				production: {
					vars: {
						VAR1: "PROD_VALUE1",
						VAR2: "PROD_VALUE2",
						PROD_VAR3: "PROD_VALUE3",
						JSON: { json: true },
					},
				},
				preview: {
					vars: {
						VAR1: "PREVIEW_VALUE1",
						VAR2: "PREVIEW_VALUE2",
						PREVIEW_VAR3: "PREVIEW_VALUE3",
						JSON: { json: true },
					},
				},
			},
		});
		await runWrangler("pages functions build-env . --outfile data.json");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.toml file. Reading build configuration...
			pages_build_output_dir: dist
			Build environment variables:
			  - VAR1: VALUE1
			  - VAR2: VALUE2"
		`);
		expect(readFileSync("data.json", "utf8")).toMatchInlineSnapshot(
			`"{"vars":{"VAR1":"VALUE1","VAR2":"VALUE2"},"pages_build_output_dir":"dist"}"`
		);
	});

	it("should return top-level by default (json)", async ({ expect }) => {
		vi.stubEnv("PAGES_ENVIRONMENT", "");
		writeWranglerConfig(
			{
				pages_build_output_dir: "./dist",
				vars: {
					VAR1: "VALUE1",
					VAR2: "VALUE2",
					JSON: { json: true },
				},
				env: {
					production: {
						vars: {
							VAR1: "PROD_VALUE1",
							VAR2: "PROD_VALUE2",
							PROD_VAR3: "PROD_VALUE3",
							JSON: { json: true },
						},
					},
					preview: {
						vars: {
							VAR1: "PREVIEW_VALUE1",
							VAR2: "PREVIEW_VALUE2",
							PREVIEW_VAR3: "PREVIEW_VALUE3",
							JSON: { json: true },
						},
					},
				},
			},
			"wrangler.json"
		);
		await runWrangler("pages functions build-env . --outfile data.json");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.json file. Reading build configuration...
			pages_build_output_dir: dist
			Build environment variables:
			  - VAR1: VALUE1
			  - VAR2: VALUE2"
		`);
		expect(readFileSync("data.json", "utf8")).toMatchInlineSnapshot(
			`"{"vars":{"VAR1":"VALUE1","VAR2":"VALUE2"},"pages_build_output_dir":"dist"}"`
		);
	});

	it("should return production", async ({ expect }) => {
		vi.stubEnv("PAGES_ENVIRONMENT", "production");
		writeWranglerConfig({
			pages_build_output_dir: "./dist",
			vars: {
				VAR1: "VALUE1",
				VAR2: "VALUE2",
				JSON: { json: true },
			},
			env: {
				production: {
					vars: {
						VAR1: "PROD_VALUE1",
						VAR2: "PROD_VALUE2",
						PROD_VAR3: "PROD_VALUE3",
						JSON: { json: true },
					},
				},
				preview: {
					vars: {
						VAR1: "PREVIEW_VALUE1",
						VAR2: "PREVIEW_VALUE2",
						PREVIEW_VAR3: "PREVIEW_VALUE3",
						JSON: { json: true },
					},
				},
			},
		});
		await runWrangler("pages functions build-env . --outfile data.json");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.toml file. Reading build configuration...
			pages_build_output_dir: dist
			Build environment variables:
			  - VAR1: PROD_VALUE1
			  - VAR2: PROD_VALUE2
			  - PROD_VAR3: PROD_VALUE3"
		`);
		expect(readFileSync("data.json", "utf8")).toMatchInlineSnapshot(
			`"{"vars":{"VAR1":"PROD_VALUE1","VAR2":"PROD_VALUE2","PROD_VAR3":"PROD_VALUE3"},"pages_build_output_dir":"dist"}"`
		);
	});

	it("should return preview", async ({ expect }) => {
		vi.stubEnv("PAGES_ENVIRONMENT", "preview");
		writeWranglerConfig({
			pages_build_output_dir: "./dist",
			vars: {
				VAR1: "VALUE1",
				VAR2: "VALUE2",
				JSON: { json: true },
			},
			env: {
				production: {
					vars: {
						VAR1: "PROD_VALUE1",
						VAR2: "PROD_VALUE2",
						PROD_VAR3: "PROD_VALUE3",
						JSON: { json: true },
					},
				},
				preview: {
					vars: {
						VAR1: "PREVIEW_VALUE1",
						VAR2: "PREVIEW_VALUE2",
						PREVIEW_VAR3: "PREVIEW_VALUE3",
						JSON: { json: true },
					},
				},
			},
		});
		await runWrangler("pages functions build-env . --outfile data.json");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.toml file. Reading build configuration...
			pages_build_output_dir: dist
			Build environment variables:
			  - VAR1: PREVIEW_VALUE1
			  - VAR2: PREVIEW_VALUE2
			  - PREVIEW_VAR3: PREVIEW_VALUE3"
		`);
		expect(readFileSync("data.json", "utf8")).toMatchInlineSnapshot(
			`"{"vars":{"VAR1":"PREVIEW_VALUE1","VAR2":"PREVIEW_VALUE2","PREVIEW_VAR3":"PREVIEW_VALUE3"},"pages_build_output_dir":"dist"}"`
		);
	});

	it("should render output directory path relative to project directory, even if wrangler config is redirected", async ({
		expect,
	}) => {
		vi.stubEnv("PAGES_ENVIRONMENT", "");
		writeWranglerConfig(
			{
				// Note this path is relative to the "generated" wrangler.json
				pages_build_output_dir: "./dist",
			},
			"build/wrangler.json"
		);
		mkdirSync(".wrangler/deploy", { recursive: true });
		writeFileSync(
			".wrangler/deploy/config.json",
			JSON.stringify({ configPath: "../../build/wrangler.json" })
		);

		await runWrangler("pages functions build-env . --outfile data.json");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Checking for configuration in a Wrangler configuration file (BETA)

			Found wrangler.json file. Reading build configuration...
			pages_build_output_dir: build/dist
			Build environment variables: (none found)"
		`);
		expect(
			normalizeString(
				JSON.parse(readFileSync("data.json", "utf8")).pages_build_output_dir
			)
		).toEqual("build/dist");
	});
});
