import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test(
	"imports of a module still settle after a Durable Object is aborted during one",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/16785
		// A `ctx.abort()` inside a Durable Object during an in-flight dynamic
		// `import()` leaves the module runner's shared in-flight entry pending, so
		// later imports of the same module in the same test file never settle,
		// even from the test itself.
		await seed({
			"vitest.config.mts": vitestConfig({
				wrangler: { configPath: "./wrangler.jsonc" },
			}),
			"wrangler.jsonc": JSON.stringify({
				name: "do-import-abort",
				main: "./src/index.ts",
				compatibility_date: "2025-12-02",
				compatibility_flags: ["nodejs_compat"],
				durable_objects: {
					bindings: [{ name: "VICTIM", class_name: "Victim" }],
				},
				migrations: [{ tag: "v1", new_sqlite_classes: ["Victim"] }],
			}),
			"src/lazy.ts": dedent /* javascript */ `
				export const value = 1;
			`,
			"src/index.ts": dedent /* javascript */ `
				import { DurableObject } from "cloudflare:workers";

				export class Victim extends DurableObject {
					importAndAbort(abort) {
						void import("./lazy");
						if (abort) this.ctx.abort("stopped during an import");
					}
				}

				export default { fetch: () => new Response("ok") };
			`,
			"test/hang.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				import { expect, it } from "vitest";

				const importLazy = () =>
					Promise.race([
						import("../src/lazy").then(() => "loaded"),
						new Promise((resolve) => setTimeout(() => resolve("hung"), 3_000)),
					]);

				it("control: no abort", async () => {
					await env.VICTIM.getByName("a").importAndAbort(false);
					await new Promise((resolve) => setTimeout(resolve, 200));
					expect(await importLazy()).toBe("loaded");
				});

				it("abort during an import", async () => {
					await env.VICTIM.getByName("b").importAndAbort(true).catch(() => {});
					expect(await importLazy()).toBe("loaded");
				}, 10_000);
			`,
		});

		const result = await vitestRun();
		// The control test passes, but the abort test's own `import()` of
		// `src/lazy` never settles and hits the race timeout instead.
		expect(result.stderr).not.toContain("expected 'hung' to be 'loaded'");
		expect(result.stdout).not.toMatch(/× abort during an import/);
		expect(await result.exitCode).toBe(0);
	}
);
