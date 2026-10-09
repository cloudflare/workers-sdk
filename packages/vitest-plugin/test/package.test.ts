import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dedent from "ts-dedent";
import { inject, it } from "vitest";

const execFileAsync = promisify(execFile);

it("loads without Wrangler installed", async ({ expect }) => {
	const result = execFileAsync(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			dedent`
                import assert from "node:assert/strict";
                import { createRequire } from "node:module";
                const require = createRequire(import.meta.resolve("@cloudflare/vitest-plugin"));
                assert.throws(() => require.resolve("wrangler"), { code: "MODULE_NOT_FOUND" });
                const { cloudflareTest } = await import("@cloudflare/vitest-plugin");
                assert.equal(typeof cloudflareTest, "function");
            `,
		],
		{
			cwd: inject("tmpPoolInstallationPath"),
			env: { ...process.env, NODE_PATH: "" },
		}
	);

	await expect(result).resolves.toMatchObject({ stdout: "", stderr: "" });
});
