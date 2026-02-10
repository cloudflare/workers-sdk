import dedent from "ts-dedent";
import { test } from "./helpers";

// Sequencer that always runs tests alphabetically by name
const deterministicSequencer = `
import { BaseSequencer } from "vitest/node";

export class DeterministicSequencer extends BaseSequencer {
	sort(files) {
		return [...files].sort((a, b) => a[1].localeCompare(b[1]));
	}
}
`;

test(
	"isolated storage with multiple workers",
	{ timeout: 30_000 },
	async ({ expect, seed, vitestRun }) => {
		// Check unique global scopes, storage isolated, and unique auxiliaries:
		// https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/#isolatedstorage-true-singleworker-false-default
		await seed({
			"sequencer.ts": deterministicSequencer,
			"auxiliary.mjs": dedent`
			let count = 0;
			export default {
				fetch() {
					return new Response(++count);
				}
			}
		`,
			"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			import { DeterministicSequencer } from "./sequencer.ts";

			export default defineWorkersConfig({
				test: {
					sequence: { sequencer: DeterministicSequencer },
					poolOptions: {
						workers: {
							isolatedStorage: true,
							singleWorker: false,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
								kvNamespaces: ["NAMESPACE"],
								serviceBindings: { AUXILIARY: "auxiliary" },
								workers: [
									{
										name: "auxiliary",
										modules: true,
										scriptPath: "auxiliary.mjs"
									}
								]
							},
						},
					},
				}
			});
		`,
			"a.test.ts": dedent`
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
			"b.test.ts": dedent`
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
		let result = await vitestRun();
		expect(await result.exitCode).toBe(0);

		// Check prohibits concurrent tests
		await seed({
			"b.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, expect } from "vitest";
			it.concurrent("does something else", () => {});
		`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		const expected = dedent`
		Error: Concurrent tests are unsupported with isolated storage. Please either:
		- Remove \`.concurrent\` from the "does something else" test
		- Remove \`.concurrent\` from all \`describe()\` blocks containing the "does something else" test
		- Remove \`isolatedStorage: true\` from your project's Vitest config
	`;
		expect(result.stderr).toMatch(expected);
	}
);

test(
	"isolated storage with single worker",
	{ timeout: 30_000 },
	async ({ expect, seed, vitestRun }) => {
		// Check shared global scope, storage isolated, and shared auxiliaries:
		// https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/#isolatedstorage-true-singleworker-true
		await seed({
			"sequencer.ts": deterministicSequencer,
			"auxiliary.mjs": dedent`
			let count = 0;
			export default {
				fetch() {
					return new Response(++count);
				}
			}
		`,
			"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			import { DeterministicSequencer } from "./sequencer.ts";

			export default defineWorkersConfig({
				test: {
					sequence: { sequencer: DeterministicSequencer },
					poolOptions: {
						workers: {
							isolatedStorage: true,
							singleWorker: true,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
								kvNamespaces: ["NAMESPACE"],
								serviceBindings: { AUXILIARY: "auxiliary" },
								workers: [
									{
										name: "auxiliary",
										modules: true,
										scriptPath: "auxiliary.mjs"
									}
								]
							},
						},
					},
				}
			});
		`,
			"a.test.ts": dedent`
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
			"b.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, expect } from "vitest";
			it("does something else", async () => {
				expect(globalThis.THING).toBe(true);

				expect(await env.NAMESPACE.get("key")).toBe(null);

				const response = await env.AUXILIARY.fetch("https://example.com");
				expect(await response.text()).toBe("2");
			});
		`,
		});
		let result = await vitestRun();
		expect(await result.exitCode).toBe(0);

		// Check prohibits concurrent tests
		await seed({
			"b.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, expect } from "vitest";
			it.concurrent("does something else", () => {});
		`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		const expected = dedent`
		Error: Concurrent tests are unsupported with isolated storage. Please either:
		- Remove \`.concurrent\` from the "does something else" test
		- Remove \`.concurrent\` from all \`describe()\` blocks containing the "does something else" test
		- Remove \`isolatedStorage: true\` from your project's Vitest config
	`;
		expect(result.stderr).toMatch(expected);
	}
);

test(
	"shared storage with multiple workers",
	{ timeout: 30_000 },
	async ({ expect, seed, vitestRun }) => {
		// Check unique global scopes, storage shared, and shared auxiliaries:
		// https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/#isolatedstorage-false-singleworker-false
		await seed({
			"sequencer.ts": deterministicSequencer,
			"auxiliary.mjs": dedent`
			export class SyncObject {
				#resolves = [];
				fetch(request) {
					const deferred = Promise.withResolvers();
					this.#resolves.push(deferred.resolve);
					if (this.#resolves.length === 2) {
						for (const resolve of this.#resolves) resolve(new Response());
					}
					return deferred.promise;
				}
			}

			let id;
			export default {
				fetch(request, env, ctx) {
					id ??= env.SYNC.newUniqueId();
					const stub = env.SYNC.get(id);
					return stub.fetch(request);
				}
			}
		`,
			"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			import { DeterministicSequencer } from "./sequencer.ts";

			export default defineWorkersConfig({
				test: {
					sequence: { sequencer: DeterministicSequencer },
					poolOptions: {
						workers: {
							isolatedStorage: false,
							singleWorker: false,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
								kvNamespaces: ["NAMESPACE"],
								serviceBindings: { AUXILIARY: "auxiliary" },
								workers: [
									{
										name: "auxiliary",
										modules: true,
										scriptPath: "auxiliary.mjs",
										durableObjects: { SYNC: "SyncObject" }
									}
								]
							},
						},
					},
				}
			});
		`,
			"a.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, expect } from "vitest";
			it("does something", async () => {
				globalThis.A_THING = true;
				await env.NAMESPACE.put("a", "1");

				await env.AUXILIARY.fetch("https://example.com");

				expect(globalThis.B_THING).toBe(undefined);
				expect(await env.NAMESPACE.get("b")).toBe("2");
			});
		`,
			"b.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, expect } from "vitest";
			it("does something else", async () => {
				globalThis.B_THING = true;
				await env.NAMESPACE.put("b", "2");

				await env.AUXILIARY.fetch("https://example.com");

				expect(globalThis.A_THING).toBe(undefined);
				expect(await env.NAMESPACE.get("a")).toBe("1");
			});
		`,
		});
		let result = await vitestRun();
		expect(await result.exitCode).toBe(0);

		// Check allows concurrent tests
		await seed({
			"a.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, expect } from "vitest";
			it.concurrent("does something", () => {});
		`,
			"b.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, expect } from "vitest";
			it.concurrent("does something else", () => {});
		`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);

test(
	"shared storage with single worker",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		// Check shared global scopes, storage shared, and shared auxiliaries:
		// https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/#isolatedstorage-false-singleworker-true
		await seed({
			"sequencer.ts": deterministicSequencer,
			"auxiliary.mjs": dedent`
			let count = 0;
			export default {
				fetch() {
					return new Response(++count);
				}
			}
		`,
			"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			import { DeterministicSequencer } from "./sequencer.ts";

			export default defineWorkersConfig({
				test: {
					sequence: { sequencer: DeterministicSequencer },
					poolOptions: {
						workers: {
							isolatedStorage: false,
							singleWorker: true,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
								kvNamespaces: ["NAMESPACE"],
								serviceBindings: { AUXILIARY: "auxiliary" },
								workers: [
									{
										name: "auxiliary",
										modules: true,
										scriptPath: "auxiliary.mjs"
									}
								]
							},
						},
					},
				}
			});
		`,
			"a.test.ts": dedent`
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
			"b.test.ts": dedent`
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
		let result = await vitestRun();
		expect(await result.exitCode).toBe(0);

		// Check allows concurrent tests
		await seed({
			"a.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, expect } from "vitest";
			it.concurrent("does something", () => {});
		`,
			"b.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, expect } from "vitest";
			it.concurrent("does something else", () => {});
		`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);
