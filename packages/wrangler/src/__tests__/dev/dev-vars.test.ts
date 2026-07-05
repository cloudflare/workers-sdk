import * as path from "node:path";
import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getVarsForDev } from "../../dev/dev-vars";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { mockConsoleMethods } from "../helpers/mock-console";

describe("getVarsForDev", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("merges config vars with .dev.vars without secrets defined", () => {
		fs.writeFileSync(".dev.vars", "MY_VARIABLE_A=900\nMY_SECRET=rainbow");
		
		const vars = {
			MY_VARIABLE_A: "100900", // Will be overridden
			MY_VARIABLE_B: "test", // Remains
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

	it("merges config vars with .dev.vars with secrets defined", () => {
		fs.writeFileSync(".dev.vars", "MY_VARIABLE_A=900\nMY_SECRET=rainbow\nEXTRA=ignored");
		
		const vars = {
			MY_VARIABLE_A: "100900", // Should still be overridden
			MY_VARIABLE_B: "test", // Remains
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
			MY_VARIABLE_A: { type: "secret_text", value: "900" }, // Overridden config var
			MY_SECRET: { type: "secret_text", value: "rainbow" }, // Declared secret
			MY_VARIABLE_B: { type: "plain_text", value: "test" }, // Non-overridden config var
		});
        
        // EXTRA is ignored since it's neither in vars nor in secrets
	});
});
