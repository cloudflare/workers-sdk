import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test(
	"auxiliary workers can stream tails to the main worker",
	{ timeout: 30_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "main-worker",
				main: "worker.mjs",
				compatibility_date: "2025-12-02",
			}),
			"worker.mjs": dedent /* javascript */ `
				import { WorkerEntrypoint } from "cloudflare:workers";

				const events = [];

				export default class extends WorkerEntrypoint {
					tailStream(onset) {
						events.push(onset.event.type);
						return {
							log(event) {
								events.push(event.event.type);
							},
							outcome(event) {
								events.push(event.event.type);
							},
						};
					}

					getEvents() {
						return events;
					}
				}
			`,
			"target.mjs": dedent /* javascript */ `
				export default {
					fetch() {
						console.log("target log");
						return new Response("ok");
					},
				};
			`,
			"vitest.config.mts": vitestConfig({
				wrangler: { configPath: "wrangler.jsonc" },
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
					serviceBindings: { TARGET: "target" },
					workers: [
						{
							name: "target",
							modules: true,
							scriptPath: "target.mjs",
							streamingTails: ["main-worker"],
						},
					],
				},
			}),
			"streaming-tails.test.ts": dedent /* javascript */ `
				import { env, exports } from "cloudflare:workers";
				import { expect, test, vi } from "vitest";

				test("streams tails to the main worker", async () => {
					const response = await env.TARGET.fetch("https://example.com");
					expect(await response.text()).toBe("ok");

					await vi.waitFor(async () => {
						expect(await exports.default.getEvents()).toEqual([
							"onset",
							"log",
							"outcome",
						]);
					});
				});
			`,
		});

		const result = await vitestRun();
		expect(result.stderr).toBe("");
		expect(await result.exitCode).toBe(0);
	}
);
