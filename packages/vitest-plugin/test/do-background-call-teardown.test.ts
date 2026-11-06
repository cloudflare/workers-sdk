import dedent from "ts-dedent";
import { test } from "./helpers";

// https://github.com/cloudflare/workers-sdk/issues/15920
//
// A Durable Object that starts work after a test file's last test has
// returned makes the pool import modules over RPC to the host. If Vitest's
// environment teardown rejects pending RPCs while one of those round trips is
// in flight, the run fails with `EnvironmentTeardownError: Closing rpc while
// "resolve"/"fetch" was pending` even though every test passed.
//
// In real runs the race window is only as wide as CPU load makes the round
// trip, so the seeded project stretches the module-runner round trips with
// Vite hooks: one is then always in flight while the file's environment
// tears down, making the failure deterministic.
test(
	"does not fail the run when a Durable Object call is in flight at file teardown",
	{ timeout: 120_000 },
	async ({ expect, seed, vitestRun }) => {
		const backgroundModules = Object.fromEntries(
			Array.from({ length: 20 }, (_, i) => [
				`background-${i}.js`,
				`export const index = ${i};\n`,
			])
		);

		await seed({
			"vitest.config.mts": dedent /* javascript */ `
				import { cloudflareTest } from "@cloudflare/vitest-plugin";

				const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

				// Stretch module-runner RPC round trips to the host, the way CPU
				// load does in real runs, so one is always in flight when the test
				// file's environment tears down. \`resolveId\` covers Vitest 4,
				// where every Durable Object call re-issues a "resolve" RPC even
				// for a cached module; \`load\` covers Vitest 5, where the first
				// fetch of a module is a "fetch" RPC.
				const slowModules = {
					name: "slow-modules",
					async resolveId(id) {
						if (id.endsWith("/index.ts")) {
							await delay(500);
						}
						return null;
					},
					async load(id) {
						if (id.includes("/background-")) {
							await delay(500);
						}
						return null;
					},
				};

				export default {
					plugins: [
						slowModules,
						cloudflareTest({
							main: "./index.ts",
							wrangler: { configPath: "./wrangler.jsonc" },
						}),
					],
					test: { testTimeout: 90_000 },
				};
			`,
			"wrangler.jsonc": dedent`
				{
					"name": "do-background-call",
					"main": "./index.ts",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"],
					"durable_objects": {
						"bindings": [
							{ "name": "MAIN", "class_name": "MainDurableObject" },
							{ "name": "OTHER", "class_name": "OtherDurableObject" }
						]
					},
					"exports": {
						"MainDurableObject": { "type": "durable-object", "storage": "sqlite" },
						"OtherDurableObject": { "type": "durable-object", "storage": "sqlite" }
					}
				}
			`,
			"index.ts": dedent /* javascript */ `
				import { DurableObject } from "cloudflare:workers";

				export class OtherDurableObject extends DurableObject {
					async ping() {
						return "pong";
					}
				}

				export class MainDurableObject extends DurableObject {
					// Starts calls to another Durable Object that outlive this
					// test file's last test, like background index updates pushed
					// from a timer that isn't awaited.
					async kickoff() {
						const stub = this.env.OTHER.get(
							this.env.OTHER.idFromName("other")
						);
						for (let i = 0; i < 20; i++) {
							this.ctx.waitUntil(
								(async () => {
									await new Promise((resolve) =>
										setTimeout(resolve, i * 25)
									);
									await stub.ping();
									await import("./background-" + i + ".js");
									console.log("background-done " + i);
								})()
							);
						}
					}
				}

				export default {
					async fetch() {
						return new Response("ok");
					},
				};
			`,
			"index.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				import { expect, it } from "vitest";

				it("passes while the Durable Object does background work", async () => {
					const otherId = env.OTHER.idFromName("other");
					expect(await env.OTHER.get(otherId).ping()).toBe("pong");

					const mainId = env.MAIN.idFromName("main");
					await env.MAIN.get(mainId).kickoff();
					expect(await env.OTHER.get(otherId).ping()).toBe("pong");
				});
			`,
			...backgroundModules,
		});

		const result = await vitestRun();
		const output = result.stdout + result.stderr;
		expect(await result.exitCode).toBe(0);
		// Every background call should have completed before teardown
		expect(output).toContain("background-done 19");
		expect(output).not.toContain("EnvironmentTeardownError");
	}
);
