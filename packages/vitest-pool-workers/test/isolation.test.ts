import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test(
	"isolated storage with multiple workers",
	{ timeout: 30_000 },
	async ({ expect, seed, vitestRun }) => {
		// Check unique global scopes, storage isolated, and unique auxiliaries:
		// https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/#isolatedstorage-true-singleworker-false-default
		await seed({
			"auxiliary.mjs": dedent /* javascript */ `
				let count = 0;
				export default {
					fetch() {
						return new Response(++count);
					}
				}
			`,
			"vitest.config.mts": vitestConfig({
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
					kvNamespaces: ["NAMESPACE"],
					serviceBindings: { AUXILIARY: "auxiliary" },
					workers: [
						{
							name: "auxiliary",
							modules: true,
							scriptPath: "auxiliary.mjs",
						},
					],
				},
			}),
			"a.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				import { it, expect } from "vitest";
				it("does something", async () => {
					expect(globalThis.THING).toBe(undefined);
					globalThis.THING = true;

					expect(await env.NAMESPACE.get("key")).toBe(null);
					await env.NAMESPACE.put("key", "value");

					const response = await env.AUXILIARY.fetch("https://example.com");
					expect(await response.text()).toBe("1");
				});
			`,
			"b.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				import { it, expect } from "vitest";
				it("does something else", async () => {
					expect(globalThis.THING).toBe(undefined);
					globalThis.THING = true;

					expect(await env.NAMESPACE.get("key")).toBe(null);
					await env.NAMESPACE.put("key", "value");

					const response = await env.AUXILIARY.fetch("https://example.com");
					expect(await response.text()).toBe("1");
				});
			`,
		});
		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);

test(
	"isolated storage with single worker",
	{ timeout: 30_000 },
	async ({ expect, seed, vitestRun }) => {
		// Check shared global scope, storage isolated, and shared auxiliaries:
		// https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/#isolatedstorage-true-singleworker-true
		await seed({
			"auxiliary.mjs": dedent`
			let count = 0;
			export default {
				fetch() {
					return new Response(++count);
				}
			}
		`,
			"vitest.config.mts": vitestConfig({
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
					kvNamespaces: ["NAMESPACE"],
					serviceBindings: { AUXILIARY: "auxiliary" },
					workers: [
						{
							name: "auxiliary",
							modules: true,
							scriptPath: "auxiliary.mjs",
						},
					],
				},
			}),
			"a.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				import { it, expect } from "vitest";
				it("does something", async () => {
					expect(await env.NAMESPACE.get("key")).toBe(null);
					await env.NAMESPACE.put("key", "value");

					const response = await env.AUXILIARY.fetch("https://example.com");
					expect(await response.text()).toBe("1");
				});
			`,
			"b.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				import { it, expect } from "vitest";
				it("does something else", async () => {
					expect(await env.NAMESPACE.get("key")).toBe(null);

					const response = await env.AUXILIARY.fetch("https://example.com");
					expect(await response.text()).toBe("1");
				});
			`,
		});
		const result = await vitestRun({
			flags: ["--max-workers=1"],
		});
		expect(await result.exitCode).toBe(0);
	}
);

test(
	"shared storage with single worker",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		// With --no-isolate --max-workers=1, test files share globals, storage, and auxiliaries
		await seed({
			"auxiliary.mjs": dedent /* javascript */ `
				let count = 0;
				export default {
					fetch() {
						return new Response(++count);
					}
				}
			`,
			"vitest.config.mts": vitestConfig({
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
					kvNamespaces: ["NAMESPACE"],
					serviceBindings: { AUXILIARY: "auxiliary" },
					workers: [
						{
							name: "auxiliary",
							modules: true,
							scriptPath: "auxiliary.mjs",
						},
					],
				},
			}),
			"a.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				import { it, expect } from "vitest";
				it("does something", async () => {
					expect(globalThis.THING).toBe(undefined);
					globalThis.THING = true;

					expect(await env.NAMESPACE.get("key")).toBe(null);
					await env.NAMESPACE.put("key", "value");

					const response = await env.AUXILIARY.fetch("https://example.com");
					expect(await response.text()).toBe("1");
				});
			`,
			"b.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				import { it, expect } from "vitest";
				it("does something else", async () => {
					expect(globalThis.THING).toBe(true);

					expect(await env.NAMESPACE.get("key")).toBe("value");

					const response = await env.AUXILIARY.fetch("https://example.com");
					expect(await response.text()).toBe("2");
				});
			`,
		});
		const result = await vitestRun({
			flags: ["--no-isolate", "--max-workers=1"],
		});
		expect(await result.exitCode).toBe(0);
	}
);
