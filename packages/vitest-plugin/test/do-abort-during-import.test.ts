import dedent from "ts-dedent";
import { test } from "./helpers";

// https://github.com/cloudflare/workers-sdk/issues/16785
// A Durable Object aborted while a dynamic `import()` is in flight leaves the
// module runner's in-flight promise for that module forever pending, so every
// later `import()` of the same module in the test file hangs.
test(
	"a Durable Object aborted during a dynamic import() doesn't hang later imports of that module",
	{ timeout: 120_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent /* javascript */ `
				import { cloudflareTest } from "@cloudflare/vitest-plugin";

				export default {
					plugins: [
						cloudflareTest({
							wrangler: { configPath: "./wrangler.jsonc" },
						}),
					],
					test: { testTimeout: 60_000 },
				};
			`,
			"wrangler.jsonc": dedent`
				{
					"name": "do-abort-during-import",
					"main": "./index.ts",
					"compatibility_date": "2026-10-01",
					"compatibility_flags": ["nodejs_compat"],
					"durable_objects": {
						"bindings": [{ "name": "VICTIM", "class_name": "Victim" }]
					},
					"migrations": [{ "tag": "v1", "new_sqlite_classes": ["Victim"] }]
				}
			`,
			"lazy.ts": dedent /* javascript */ `
				export const value = 1;
			`,
			"index.ts": dedent /* javascript */ `
				import { DurableObject } from "cloudflare:workers";

				export class Victim extends DurableObject {
					importAndAbort(abort: boolean) {
						void import("./lazy");
						if (abort) this.ctx.abort("stopped during an import");
					}
				}

				export default {
					fetch: () => new Response("ok"),
				};
			`,
			"hang.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				import { expect, it } from "vitest";

				const importLazy = () =>
					Promise.race([
						import("./lazy").then(() => "loaded"),
						scheduler.wait(3_000).then(() => "hung"),
					]);

				it("control: no abort", async () => {
					await env.VICTIM.getByName("a").importAndAbort(false);
					await scheduler.wait(200);
					expect(await importLazy()).toBe("loaded");
				});

				it("abort during an import", async () => {
					await env.VICTIM.getByName("b").importAndAbort(true).catch(() => {});
					expect(await importLazy()).toBe("loaded");
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
	}
);
