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

	it("does not silently load nothing from a UTF-16LE .dev.vars file", ({
		expect,
	}) => {
		// UTF-16LE with a BOM, as written by Windows PowerShell's `>` and `Out-File`
		fs.writeFileSync(
			".dev.vars",
			Buffer.concat([
				Buffer.from([0xff, 0xfe]),
				Buffer.from("API_KEY=abc\n", "utf16le"),
			])
		);

		let threw = false;
		let result: Record<string, unknown> | undefined;
		try {
			result = getVarsForDev(
				path.resolve("wrangler.jsonc"),
				undefined,
				{},
				undefined,
				false // not silent, so a warning would be visible
			);
		} catch {
			threw = true;
		}

		const warnedAboutEncoding = /utf-?16|BOM|encoding/i.test(
			`${std.warn}${std.out}${std.err}`
		);
		const loadedSomething = !!result && Object.keys(result).length > 0;
		expect(
			threw || warnedAboutEncoding || loadedSomething,
			"Wrangler should error, warn about the file's encoding, or actually load the variables from a UTF-16 .dev.vars file"
		).toBe(true);
	});

	it("does not silently load nothing from a UTF-16LE .env file", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV", "true");
		try {
			fs.writeFileSync(
				".env",
				Buffer.concat([
					Buffer.from([0xff, 0xfe]),
					Buffer.from("ENV_SECRET=moon\n", "utf16le"),
				])
			);

			let threw = false;
			let result: Record<string, unknown> | undefined;
			try {
				result = getVarsForDev(
					path.resolve("wrangler.jsonc"),
					undefined,
					{},
					undefined,
					false // not silent, so a warning would be visible
				);
			} catch {
				threw = true;
			}

			const warnedAboutEncoding = /utf-?16|BOM|encoding/i.test(
				`${std.warn}${std.out}${std.err}`
			);
			const loadedSomething = !!result && Object.keys(result).length > 0;
			expect(
				threw || warnedAboutEncoding || loadedSomething,
				"Wrangler should error, warn about the file's encoding, or actually load the variables from a UTF-16 .env file"
			).toBe(true);
		} finally {
			vi.unstubAllEnvs();
		}
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
