import { urlFromParts } from "@cloudflare/remote-bindings/internal";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { MultiworkerRuntimeController } from "../../../api/startDevWorker/MultiworkerRuntimeController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { useTeardown } from "../../helpers/teardown";
import { unusable } from "../../helpers/unusable";
import type { Bundle, StartDevWorkerOptions } from "../../../api";

function makeEsbuildBundle(testBundle: string): Bundle {
	return {
		type: "esm",
		modules: [],
		id: 0,
		path: "/virtual/index.mjs",
		entrypointSource: testBundle,
		entry: {
			file: "index.mjs",
			projectRoot: "/virtual/",
			configPath: undefined,
			format: "modules",
			moduleRoot: "/virtual",
			name: undefined,
			exports: [],
		},
		dependencies: {},
		sourceMapPath: undefined,
		sourceMapMetadata: undefined,
	};
}

function configDefaults(
	config: Partial<StartDevWorkerOptions>
): StartDevWorkerOptions {
	return {
		name: "test-worker",
		compatibilityDate: "2025-10-10",
		complianceRegion: undefined,
		entrypoint: "NOT_REAL",
		projectRoot: "NOT_REAL",
		build: unusable<StartDevWorkerOptions["build"]>(),
		legacy: {},
		dev: { persist: "./persist", remote: false },
		...config,
	};
}

describe("MultiworkerRuntimeController", () => {
	mockConsoleMethods();
	runInTempDir();
	const teardown = useTeardown();

	describe("stale bundle bail-out", () => {
		it("should not bail out when different workers submit bundles", async ({
			expect,
		}) => {
			const bus = new FakeBus();
			const controller = new MultiworkerRuntimeController(bus, 2);
			teardown(() => controller.teardown());

			function makeWorkerConfig(name: string, primary: boolean) {
				return configDefaults({
					name,
					entrypoint: "NOT_REAL",
					dev: {
						persist: "./persist",
						remote: false,
						multiworkerPrimary: primary,
					},
				});
			}

			function makeWorkerBundle(name: string) {
				return makeEsbuildBundle(dedent /*javascript*/ `
					export default {
						fetch(request, env, ctx) {
							return new Response("hello from ${name}");
						}
					}
				`);
			}

			// Submit bundles for both workers — the key scenario that was
			// broken: worker B's onBundleComplete would invalidate worker A's
			// in-flight processing because they shared a single counter.
			const configA = makeWorkerConfig("worker-a", true);
			const configB = makeWorkerConfig("worker-b", false);

			controller.onBundleStart({ type: "bundleStart", config: configA });
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configA,
				bundle: makeWorkerBundle("worker-a"),
			});

			controller.onBundleStart({ type: "bundleStart", config: configB });
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configB,
				bundle: makeWorkerBundle("worker-b"),
			});

			// Both workers should have their options stored and Miniflare
			// should start — resulting in a reloadComplete event.
			const event = await bus.waitFor("reloadComplete");
			const res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toContain("hello from");
		});

		it("supports ratelimit bindings on secondary workers", async ({
			expect,
		}) => {
			const bus = new FakeBus();
			const controller = new MultiworkerRuntimeController(bus, 2);
			teardown(() => controller.teardown());

			// The primary forwards every request to the secondary worker via a
			// service binding; the secondary owns the rate-limit binding. The
			// runtime controller used to delete ratelimits from secondary workers
			// to work around a Miniflare crash — this exercises that path
			// end-to-end to guard against a regression.
			const primaryConfig = configDefaults({
				name: "worker-a",
				bindings: { DOWNSTREAM: { type: "service", service: "worker-b" } },
				dev: {
					persist: "./persist",
					remote: false,
					multiworkerPrimary: true,
				},
			});
			const secondaryConfig = configDefaults({
				name: "worker-b",
				bindings: {
					RATE: {
						type: "ratelimit",
						namespace_id: "b-namespace",
						simple: { limit: 2, period: 60 },
					},
				},
				dev: {
					persist: "./persist",
					remote: false,
					multiworkerPrimary: false,
				},
			});

			const primaryBundle = makeEsbuildBundle(dedent /*javascript*/ `
				export default {
					fetch(request, env, ctx) {
						return env.DOWNSTREAM.fetch(request);
					}
				}
			`);
			const secondaryBundle = makeEsbuildBundle(dedent /*javascript*/ `
				export default {
					async fetch(request, env, ctx) {
						const { success } = await env.RATE.limit({ key: "k" });
						return new Response(success ? "ok" : "limited", {
							status: success ? 200 : 429,
						});
					}
				}
			`);

			controller.onBundleStart({
				type: "bundleStart",
				config: primaryConfig,
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: primaryConfig,
				bundle: primaryBundle,
			});
			controller.onBundleStart({
				type: "bundleStart",
				config: secondaryConfig,
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: secondaryConfig,
				bundle: secondaryBundle,
			});

			const event = await bus.waitFor("reloadComplete");
			const url = urlFromParts(event.proxyData.userWorkerUrl);

			// limit is 2, so the first two requests succeed and the third is
			// rate limited — proving the secondary's binding survived the merge.
			expect((await fetch(url)).status).toBe(200);
			expect((await fetch(url)).status).toBe(200);
			expect((await fetch(url)).status).toBe(429);
		});

		it("should skip stale bundles for the same worker during rapid updates", async ({
			expect,
		}) => {
			const bus = new FakeBus();
			const controller = new MultiworkerRuntimeController(bus, 2);
			teardown(() => controller.teardown());

			function makeWorkerConfig(
				name: string,
				primary: boolean,
				version?: number
			) {
				return configDefaults({
					name,
					entrypoint: "NOT_REAL",
					bindings: version
						? { VERSION: { type: "json", value: version } }
						: undefined,
					dev: {
						persist: "./persist",
						remote: false,
						multiworkerPrimary: primary,
					},
				});
			}

			function makeWorkerBundle(name: string, version?: number) {
				const body = version
					? `Response.json({ name: "${name}", version: ${version} })`
					: `new Response("hello from ${name}")`;
				return makeEsbuildBundle(dedent /*javascript*/ `
					export default {
						fetch(request, env, ctx) {
							return ${body};
						}
					}
				`);
			}

			// Initial setup: both workers
			const configA = makeWorkerConfig("worker-a", true, 1);
			const configB = makeWorkerConfig("worker-b", false);

			controller.onBundleStart({ type: "bundleStart", config: configA });
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configA,
				bundle: makeWorkerBundle("worker-a", 1),
			});
			controller.onBundleStart({ type: "bundleStart", config: configB });
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configB,
				bundle: makeWorkerBundle("worker-b"),
			});

			await bus.waitFor("reloadComplete");

			// Record events before rapid updates
			const eventsBefore = bus.events.length;

			// Fire rapid updates for worker-a only — simulates repeated
			// config saves for a single worker in a multiworker setup.
			for (let v = 2; v <= 6; v++) {
				const config = makeWorkerConfig("worker-a", true, v);
				controller.onBundleStart({ type: "bundleStart", config });
				controller.onBundleComplete({
					type: "bundleComplete",
					config,
					bundle: makeWorkerBundle("worker-a", v),
				});
			}

			// Wait for the final reloadComplete
			const event = await bus.waitFor("reloadComplete");
			const res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			const json = (await res.json()) as { name: string; version: number };
			expect(json).toEqual({ name: "worker-a", version: 6 });

			// Give stale bundles time to flush through the mutex
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Stale bundles should bail out early — only one reloadComplete
			const reloadCompleteEvents = bus.events
				.slice(eventsBefore)
				.filter((e) => e.type === "reloadComplete");
			expect(reloadCompleteEvents).toHaveLength(1);
		});
	});
});
