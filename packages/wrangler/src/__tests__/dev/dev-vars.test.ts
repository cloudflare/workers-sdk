import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
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
		vi.stubEnv("CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV", "true");
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
			vi.unstubAllEnvs();
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

	// Windows PowerShell 5.1's `>` and Out-File write UTF-16LE with a BOM,
	// which decodes as UTF-8 to replacement characters and null bytes, so no
	// variables parse. Loading must not silently say the file is being used.
	// https://github.com/cloudflare/workers-sdk/issues/16718
	it("warns or errors about a UTF-16 encoded .dev.vars file", ({ expect }) => {
		fs.writeFileSync(
			".dev.vars",
			Buffer.concat([
				Buffer.from([0xff, 0xfe]),
				Buffer.from("API_KEY=abc\r\n", "utf16le"),
			])
		);

		let thrown: unknown;
		let result: ReturnType<typeof getVarsForDev> | undefined;
		try {
			result = getVarsForDev(
				path.resolve("wrangler.jsonc"),
				undefined,
				{ MY_VARIABLE_A: "config" },
				undefined,
				false
			);
		} catch (e) {
			thrown = e;
		}

		if (thrown === undefined) {
			// The file's contents loaded no variables.
			expect(result).toEqual({
				MY_VARIABLE_A: { type: "plain_text", value: "config" },
			});
		}
		// Either way, the encoding must be called out, as `wrangler` already
		// does for UTF-16 config files and for `.assetsignore`.
		const message =
			thrown instanceof Error ? thrown.message : `${std.warn}${std.err}`;
		expect(message).toMatch(/UTF-16/);
	});

	it("warns or errors about a UTF-16 encoded .env file", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV", "true");
		try {
			fs.writeFileSync(
				".env",
				Buffer.concat([
					Buffer.from([0xff, 0xfe]),
					Buffer.from("ENV_SECRET=moon\r\n", "utf16le"),
				])
			);

			let thrown: unknown;
			let result: ReturnType<typeof getVarsForDev> | undefined;
			try {
				result = getVarsForDev(
					path.resolve("wrangler.jsonc"),
					undefined,
					{ MY_VARIABLE_A: "config" },
					undefined,
					false
				);
			} catch (e) {
				thrown = e;
			}

			if (thrown === undefined) {
				// The file's contents loaded no variables.
				expect(result).toEqual({
					MY_VARIABLE_A: { type: "plain_text", value: "config" },
				});
			}
			// Either way, the encoding must be called out, as `wrangler` already
			// does for UTF-16 config files and for `.assetsignore`.
			const message =
				thrown instanceof Error ? thrown.message : `${std.warn}${std.err}`;
			expect(message).toMatch(/UTF-16/);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
