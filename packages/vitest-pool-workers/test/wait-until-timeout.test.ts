import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test(
	"abandons waitUntil promises that never resolve and logs a warning",
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				main: "./index.ts",
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
				},
			}),
			"index.ts": dedent`
				export default {
					fetch(request, env, ctx) {
						// Register a waitUntil promise that will never resolve
						ctx.waitUntil(new Promise(() => {}));
						return new Response("ok");
					}
				}
			`,
			"index.test.ts": dedent`
				import { SELF } from "cloudflare:test";
				import { setWaitUntilTimeout } from "cloudflare:test-internal";
				import { beforeAll, expect, it } from "vitest";

				beforeAll(() => {
					// Use a short timeout so the test doesn't take 30s
					setWaitUntilTimeout(100);
				});

				it("sends request with never-resolving waitUntil", async () => {
					const response = await SELF.fetch("https://example.com");
					expect(response.ok).toBe(true);
				});
			`,
		});
		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
		const output = result.stdout + result.stderr;
		expect(output).toContain(
			"waitUntil promise(s) did not resolve within"
		);
	}
);
