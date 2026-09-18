import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { test } from "./helpers";

// https://github.com/cloudflare/workers-sdk/commit/a6ddbdb2b67978377dda1acda289fe21eb0892bd
// Registered Worker work must finish while the test runner can still load modules.
test("finishes registered Worker work before shutting down its module loader", async ({
	expect,
	seed,
	vitestRun,
}) => {
	const files = ["vitest.config.mjs", "worker.js", "late.js"];
	await seed(
		Object.fromEntries(
			await Promise.all(
				files.map(async (name) => [
					name,
					await fs.readFile(
						path.join(import.meta.dirname, "fixtures/wait-until", name),
						"utf8"
					),
				])
			)
		)
	);
	await seed({
		"index.test.ts": dedent`
      import { createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
      import { it } from "vitest";

      it("registers work after explicitly handling another context's failure", async ({ expect }) => {
        const context = createExecutionContext();
        const handled = new Error("explicitly handled background failure");
        context.waitUntil(Promise.reject(handled));
        await expect(waitOnExecutionContext(context)).rejects.toBe(handled);

        const response = await SELF.fetch("https://worker.invalid/");
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("registered");
      });
    `,
	});
	const result = await vitestRun({ flags: ["--retry=0"] });
	expect(result.stdout + result.stderr).not.toContain("Unhandled Error");
	expect(await result.exitCode, result.stdout + result.stderr).toBe(0);
});
