import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

// A Worker whose module graph reaches a compatibility-gated built-in that isn't
// enabled used to take down `workerd` with
// `*** Received signal #11: Segmentation fault: 11` before any test ran,
// reporting only "Worker exited unexpectedly" and naming no module.
// See https://github.com/cloudflare/workers-sdk/issues/14590
test(
	"reports a `node:*` built-in missing at the Worker's compatibility settings",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				main: "./index.ts",
				miniflare: {
					compatibilityDate: "2025-12-02",
					// Deliberately no `nodejs_compat`, so `workerd` doesn't provide
					// `node:child_process`.
					compatibilityFlags: [],
				},
			}),
			"index.ts": dedent /* javascript */ `
				// Never called — being statically reachable is enough to load it.
				import "node:child_process";
				export default {
					fetch() {
						return new Response("ok");
					}
				}
			`,
			// Importing `cloudflare:test` is what forces the Worker's module graph
			// (and therefore `node:child_process`) to load.
			"index.test.ts": dedent /* javascript */ `
				import { SELF } from "cloudflare:test";
				import { expect, it } from "vitest";
				it("sends request", async () => {
					const response = await SELF.fetch("https://example.com");
					expect(response.ok).toBe(true);
				});
			`,
		});

		const result = await vitestRun();
		const output = result.stdout + result.stderr;

		expect(output).not.toMatch("Segmentation fault");
		expect(output).not.toMatch("Received signal");
		// The failure must name the offending module.
		expect(output).toMatch("node:child_process");
		expect(await result.exitCode).toBe(1);
	}
);
