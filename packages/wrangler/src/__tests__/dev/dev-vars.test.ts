import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { getVarsForDev } from "../../dev/dev-vars";
import { mockConsoleMethods } from "../helpers/mock-console";

describe("getVarsForDev", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("merges config vars with .dev.vars without secrets defined", ({
		expect,
	}) => {
		fs.writeFileSync(".dev.vars", "MY_VARIABLE_A=900\nMY_SECRET=rainbow");

		const vars = {
			MY_VARIABLE_A: "100900",
			MY_VARIABLE_B: "test",
		};

		const result = getVarsForDev(
			path.resolve("wrangler.jsonc"),
			undefined,
			vars,
			undefined,
			true
		);

		expect(result).toEqual({
			MY_VARIABLE_A: { type: "secret_text", value: "900" },
			MY_SECRET: { type: "secret_text", value: "rainbow" },
			MY_VARIABLE_B: { type: "plain_text", value: "test" },
		});
	});

	it("merges config vars with .dev.vars with secrets defined", ({ expect }) => {
		fs.writeFileSync(
			".dev.vars",
			"MY_VARIABLE_A=900\nMY_SECRET=rainbow\nEXTRA=ignored"
		);

		const vars = {
			MY_VARIABLE_A: "100900",
			MY_VARIABLE_B: "test",
		};

		const secrets = { required: ["MY_SECRET"] };

		const result = getVarsForDev(
			path.resolve("wrangler.jsonc"),
			undefined,
			vars,
			undefined,
			true,
			secrets
		);

		expect(result).toEqual({
			MY_VARIABLE_A: { type: "secret_text", value: "900" },
			MY_SECRET: { type: "secret_text", value: "rainbow" },
			MY_VARIABLE_B: { type: "plain_text", value: "test" },
		});
	});

	it("warns about missing required secrets", ({ expect }) => {
		fs.writeFileSync(".dev.vars", "MY_VARIABLE_A=900");
		const vars = { MY_VARIABLE_A: "100900" };
		const secrets = { required: ["MY_MISSING_SECRET"] };

		const result = getVarsForDev(
			path.resolve("wrangler.jsonc"),
			undefined,
			vars,
			undefined,
			false, // silent=false to trigger the warning
			secrets
		);

		expect(result).toEqual({
			MY_VARIABLE_A: { type: "secret_text", value: "900" },
		});
		expect(std.warn).toContain("Missing required secrets: MY_MISSING_SECRET");
	});

	it("falls back to .env files when CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV is not false", ({
		expect,
	}) => {
		// eslint-disable-next-line turbo/no-undeclared-env-vars -- Bypassing turbo check for tests
		const originalEnv = process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV;
		// eslint-disable-next-line turbo/no-undeclared-env-vars -- Bypassing turbo check for tests
		delete process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV;
		try {
			fs.writeFileSync(".env", "MY_VARIABLE_A=900\nENV_SECRET=moon");

			const vars = { MY_VARIABLE_A: "100900" };
			const secrets = { required: ["ENV_SECRET"] };

			const result = getVarsForDev(
				path.resolve("wrangler.jsonc"),
				undefined,
				vars,
				undefined,
				true,
				secrets
			);

			expect(result).toEqual({
				MY_VARIABLE_A: { type: "secret_text", value: "900" },
				ENV_SECRET: { type: "secret_text", value: "moon" },
			});
		} finally {
			if (originalEnv === undefined) {
				// eslint-disable-next-line turbo/no-undeclared-env-vars -- Bypassing turbo check for tests
				delete process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV;
			} else {
				// eslint-disable-next-line turbo/no-undeclared-env-vars -- Bypassing turbo check for tests
				process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = originalEnv;
			}
		}
	});

	it("overrides json-typed config vars", ({ expect }) => {
		fs.writeFileSync(".dev.vars", 'JSON_VAR={"overridden":true}');

		const vars = {
			JSON_VAR: { original: true },
		};
		const secrets = { required: [] };

		const result = getVarsForDev(
			path.resolve("wrangler.jsonc"),
			undefined,
			vars,
			undefined,
			true,
			secrets
		);

		expect(result).toEqual({
			JSON_VAR: { type: "secret_text", value: '{"overridden":true}' },
		});
	});

	it("handles undefined loadedSecrets gracefully (no dev var files)", ({
		expect,
	}) => {
		const vars = { MY_VARIABLE_A: "100900" };
		const secrets = { required: ["MY_SECRET"] };

		const result = getVarsForDev(
			path.resolve("wrangler.jsonc"),
			undefined,
			vars,
			undefined,
			true,
			secrets
		);

		expect(result).toEqual({
			MY_VARIABLE_A: { type: "plain_text", value: "100900" },
		});
	});
});
