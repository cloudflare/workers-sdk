/* eslint-disable turbo/no-undeclared-env-vars */
import { readFileSync, writeFileSync } from "node:fs";
import { logger } from "../../logger";
import {
	EXIT_CODE_INVALID_PAGES_CONFIG,
	EXIT_CODE_NO_CONFIG_FOUND,
} from "../../pages/errors";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("pages build env", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	const originalEnv = process.env;
	const originalLoggerLevel = logger.loggerLevel;

	afterEach(() => {
		process.env = originalEnv;
		logger.loggerLevel = originalLoggerLevel;
	});
	beforeEach(() => {
		process.env.PAGES_ENVIRONMENT = "production";
	});

	it("should render empty object", async () => {
		writeWranglerToml({
			pages_build_output_dir: "./dist",
			vars: {},
		});
		await runWrangler("pages functions build-env . --outfile data.json");
		expect(std.out).toMatchInlineSnapshot(`
		"Checking for configuration in a wrangler.toml configuration file (BETA)

		Found wrangler.toml file. Reading build configuration...
		pages_build_output_dir: dist
		Build environment variables: (none found)"
	`);
		expect(readFileSync("data.json", "utf8")).toMatchInlineSnapshot(
			`"{\\"vars\\":{},\\"pages_build_output_dir\\":\\"dist\\"}"`
		);
	});

	it("should exit with specific exit code if no config file is found", async () => {
		logger.loggerLevel = "debug";
		await runWrangler("pages functions build-env . --outfile out.json");

		expect(process.exitCode).toEqual(EXIT_CODE_NO_CONFIG_FOUND);
		expect(std.out).toMatchInlineSnapshot(`
		"Checking for configuration in a wrangler.toml configuration file (BETA)
		"
	`);
		expect(std.debug).toContain(
			"No wrangler.toml configuration file found. Exiting."
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should fail with no project dir", async () => {
		await expect(
			runWrangler("pages functions build-env")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"No Pages project location specified"`
		);
	});

	it("should fail with no outfile", async () => {
		await expect(
			runWrangler("pages functions build-env .")
		).rejects.toThrowErrorMatchingInlineSnapshot(`"No outfile specified"`);
	});

	it("should exit with specific code if a non-pages config file is found", async () => {
		logger.loggerLevel = "debug";
		writeWranglerToml({
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
		"Checking for configuration in a wrangler.toml configuration file (BETA)

		Found wrangler.toml file. Reading build configuration..."
	`);
		expect(std.debug).toContain("wrangler.toml file is invalid. Exiting.");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should exit correctly with an unparseable config file", async () => {
		logger.loggerLevel = "debug";

		writeFileSync("./wrangler.toml", 'INVALID "FILE');
		// This error is specifically handled by the caller of build-env
		await runWrangler("pages functions build-env . --outfile data.json");

		expect(process.exitCode).toEqual(EXIT_CODE_INVALID_PAGES_CONFIG);
		expect(std.err).toContain("ParseError");
		expect(std.out).toMatchInlineSnapshot(`
		"Checking for configuration in a wrangler.toml configuration file (BETA)

		Found wrangler.toml file. Reading build configuration..."
	`);
		expect(std.debug).toContain("wrangler.toml file is invalid. Exiting.");
	});

	it("should exit correctly with a non-pages config file w/ invalid environment", async () => {
		logger.loggerLevel = "debug";
		writeWranglerToml({
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
		"Checking for configuration in a wrangler.toml configuration file (BETA)

		Found wrangler.toml file. Reading build configuration..."
	`);
		expect(std.debug).toContain("wrangler.toml file is invalid. Exiting.");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should return top-level by default", async () => {
		process.env.PAGES_ENVIRONMENT = "";
		writeWranglerToml({
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
		"Checking for configuration in a wrangler.toml configuration file (BETA)

		Found wrangler.toml file. Reading build configuration...
		pages_build_output_dir: dist
		Build environment variables:
		  - VAR1: VALUE1
		  - VAR2: VALUE2"
	`);
		expect(readFileSync("data.json", "utf8")).toMatchInlineSnapshot(
			`"{\\"vars\\":{\\"VAR1\\":\\"VALUE1\\",\\"VAR2\\":\\"VALUE2\\"},\\"pages_build_output_dir\\":\\"dist\\"}"`
		);
	});

	it("should return production", async () => {
		process.env.PAGES_ENVIRONMENT = "production";
		writeWranglerToml({
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
		"Checking for configuration in a wrangler.toml configuration file (BETA)

		Found wrangler.toml file. Reading build configuration...
		pages_build_output_dir: dist
		Build environment variables:
		  - VAR1: PROD_VALUE1
		  - VAR2: PROD_VALUE2
		  - PROD_VAR3: PROD_VALUE3"
	`);
		expect(readFileSync("data.json", "utf8")).toMatchInlineSnapshot(
			`"{\\"vars\\":{\\"VAR1\\":\\"PROD_VALUE1\\",\\"VAR2\\":\\"PROD_VALUE2\\",\\"PROD_VAR3\\":\\"PROD_VALUE3\\"},\\"pages_build_output_dir\\":\\"dist\\"}"`
		);
	});

	it("should return preview", async () => {
		process.env.PAGES_ENVIRONMENT = "preview";
		writeWranglerToml({
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
		"Checking for configuration in a wrangler.toml configuration file (BETA)

		Found wrangler.toml file. Reading build configuration...
		pages_build_output_dir: dist
		Build environment variables:
		  - VAR1: PREVIEW_VALUE1
		  - VAR2: PREVIEW_VALUE2
		  - PREVIEW_VAR3: PREVIEW_VALUE3"
	`);
		expect(readFileSync("data.json", "utf8")).toMatchInlineSnapshot(
			`"{\\"vars\\":{\\"VAR1\\":\\"PREVIEW_VALUE1\\",\\"VAR2\\":\\"PREVIEW_VALUE2\\",\\"PREVIEW_VAR3\\":\\"PREVIEW_VALUE3\\"},\\"pages_build_output_dir\\":\\"dist\\"}"`
		);
	});
});
