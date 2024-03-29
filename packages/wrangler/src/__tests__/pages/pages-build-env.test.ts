/* eslint-disable turbo/no-undeclared-env-vars */
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("pages-build-env", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
	});
	beforeEach(() => {
		process.env.PAGES_ENVIRONMENT = "production";
	});

	it("should render empty object", async () => {
		writeWranglerToml({
			pages_build_output_dir: "./dist",
			vars: {},
		});
		await runWrangler("pages functions build-env .");
		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "{}",
		  "warn": "",
		}
	`);
	});

	it("should fail with no config file", async () => {
		await expect(
			runWrangler("pages functions build-env .")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"No Pages config file found"`
		);
	});
	it("should fail correctly with a non-pages config file", async () => {
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
		await expect(
			runWrangler("pages functions build-env .")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Your wrangler.toml is not a valid Pages config file"`
		);
	});
	it("should fail correctly with a non-pages config file w/ invalid environment", async () => {
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
		await expect(
			runWrangler("pages functions build-env .")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Your wrangler.toml is not a valid Pages config file"`
		);
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
		await runWrangler("pages functions build-env .");
		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "{\\"VAR1\\":\\"VALUE1\\",\\"VAR2\\":\\"VALUE2\\"}",
		  "warn": "",
		}
	`);
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
		await runWrangler("pages functions build-env .");
		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "{\\"VAR1\\":\\"PROD_VALUE1\\",\\"VAR2\\":\\"PROD_VALUE2\\",\\"PROD_VAR3\\":\\"PROD_VALUE3\\"}",
		  "warn": "",
		}
	`);
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
		await runWrangler("pages functions build-env .");
		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "{\\"VAR1\\":\\"PREVIEW_VALUE1\\",\\"VAR2\\":\\"PREVIEW_VALUE2\\",\\"PREVIEW_VAR3\\":\\"PREVIEW_VALUE3\\"}",
		  "warn": "",
		}
	`);
	});
});
