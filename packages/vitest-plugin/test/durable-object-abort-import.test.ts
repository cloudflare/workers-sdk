import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

// See https://github.com/cloudflare/workers-sdk/issues/16785: aborting a
// Durable Object while a dynamic `import()` is in flight leaves the module
// runner's cached promise for that module forever pending, so every later
// import of the same module in the same test file — including from the test
// itself — hangs.
test(
	"an aborted Durable Object does not hang later imports of a module it was importing",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				main: "./index.ts",
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
					durableObjects: { VICTIM: "Victim" },
					migrations: [{ tag: "v1", new_sqlite_classes: ["Victim"] }],
				},
			}),
			"index.ts": dedent /* javascript */ `
				import { DurableObject } from "cloudflare:workers";

				export class Victim extends DurableObject {
					importAndAbort(abort: boolean) {
						void import("./lazy");
						if (abort) {
							this.ctx.abort("stopped during an import");
						}
					}
				}

				export default {
					fetch: () => new Response("ok"),
				};
			`,
			"lazy.ts": dedent`
				export const value = 1;
			`,
			// `scheduler.wait(3_000)` guards each import with a 3 s budget, so
			// a hung import fails the test instead of stalling the run.
			"index.test.ts": dedent /* javascript */ `
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
				}, 10_000);
			`,
		});

		const result = await vitestRun();
		// The control shows the setup works: without an abort, a later import
		// of the module settles.
		expect(result.stdout).toContain("✓ control: no abort");
		// Once the Durable Object is aborted mid-import, imports made by other
		// contexts (here, the test itself) must still settle.
		expect(result.stdout).toContain("✓ abort during an import");
	}
);
