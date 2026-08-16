import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import {
	normalizeString,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import * as esbuild from "esbuild";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { BundlerController } from "../../../api/startDevWorker/BundlerController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { StartDevWorkerOptions } from "../../../api";

// Find the bundled result of a particular source file
function findSourceFile(source: string, name: string): string {
	const startIndex = source.indexOf(`// ${name}`);
	const endIndex = source.indexOf("\n//", startIndex);
	return source.slice(startIndex, endIndex);
}

/**
 * The temporary build directories created under the project root, each of which
 * also registers a process exit listener to clean itself up.
 */
function wranglerTmpDirs(): string[] {
	const tmpRoot = path.resolve(".wrangler/tmp");
	return existsSync(tmpRoot) ? readdirSync(tmpRoot) : [];
}

function configDefaults(
	config: Partial<
		Omit<StartDevWorkerOptions, "build" | "dev"> & {
			build: Partial<StartDevWorkerOptions["build"]>;
			dev: Partial<StartDevWorkerOptions["dev"]>;
		}
	>
): StartDevWorkerOptions {
	const persist = path.join(process.cwd(), ".wrangler/persist");
	return {
		name: "test-worker",
		complianceRegion: undefined,
		entrypoint: path.resolve("src/index.ts"),
		projectRoot: path.resolve("src"),
		legacy: {},
		...config,
		dev: {
			persist,
			...config.dev,
		},
		build: {
			additionalModules: [],
			processEntrypoint: false,
			nodejsCompatMode: null,
			bundle: true,
			moduleRules: [],
			custom: {},
			define: {},
			format: "modules",
			moduleRoot: path.resolve("src"),
			exports: [],
			...config.build,
		},
	};
}

describe("BundleController", { retry: 5, timeout: 10_000 }, () => {
	mockConsoleMethods();
	runInTempDir();

	// We are not using `test.extend` or `onTestFinished` helpers here to create and tear down
	// the controller because these run the teardown after all the `afterEach()` blocks have run.
	// This means that the controller doesn't get torn down until after the temporary directory has been
	// removed.
	// And so the file watchers that the controller creates can randomly fail because they are trying to
	// watch files in a directory that no longer exists.
	// By doing it ourselves in `beforeEach()` and `afterEach()` we can ensure the controller
	// is torn down before the temporary directory is removed.
	let bus: FakeBus;
	let controller: BundlerController;
	beforeEach(() => {
		bus = new FakeBus();
		controller = new BundlerController(bus);
	});
	afterEach(() => controller.teardown());

	describe("happy path bundle + watch", () => {
		test.for([
			{ name: "bundled", build: {} },
			{
				name: "unbundled with entrypoint processing",
				build: { bundle: false, processEntrypoint: true },
			},
		])("single ts source file ($name)", async ({ build }, { expect }) => {
			await seed({
				"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						//comment
						return new Response("hello world")
					}
				} satisfies ExportedHandler
			`,
			});
			const config = configDefaults({
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),
				build,
			});
			const ev = bus.waitFor("bundleComplete");
			controller.onConfigUpdate({ type: "configUpdate", config });
			const initialSource = (await ev).bundle.entrypointSource;
			expect(initialSource).not.toContain("wrangler:modules-watch");
			if (build.bundle === false) {
				return;
			}
			expect(initialSource).toContain("hello world");
			expect(findSourceFile(initialSource, "index.ts")).toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response("hello world");
					  }
					};
					"
				`);

			// Now update the source file and see that we re-bundle
			const ev2 = bus.waitFor("bundleComplete");
			await seed({
				"src/index.ts": dedent /* javascript */ `
					export default {
						fetch(request, env, ctx) {
							//comment
							return new Response("hello world 2")
						}
					} satisfies ExportedHandler
				`,
			});
			const updatedSource = (await ev2).bundle.entrypointSource;
			expect(updatedSource).not.toContain("wrangler:modules-watch");
			expect(updatedSource).toContain("hello world 2");
			expect(findSourceFile(updatedSource, "index.ts")).toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response("hello world 2");
					  }
					};
					"
				`);
		});

		test("a watch-mode rebuild failure emits an error event and recovers", async ({
			expect,
		}) => {
			await seed({
				"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						return new Response("ok")
					}
				} satisfies ExportedHandler
			`,
			});
			const config = configDefaults({
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),
			});
			const first = bus.waitFor("bundleComplete");
			controller.onConfigUpdate({ type: "configUpdate", config });
			await first;

			// Break the source: the rebuild failure must surface as an error
			// event (routed like initial-build failures, so DevEnv can emit
			// `buildFailed`), not just terminal text.
			const errorEvent = bus.waitFor(
				"error",
				(e) =>
					e.source === "BundlerController" &&
					e.reason === "Failed to rebuild the Worker"
			);
			await seed({
				"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
			`,
			});
			const errored = await errorEvent;
			expect(errored.cause).toMatchObject({
				errors: expect.arrayContaining([
					expect.objectContaining({
						location: expect.objectContaining({ file: "index.ts" }),
					}),
				]),
			});

			// Fixing the source recovers the watch loop with a fresh bundle.
			const recovered = bus.waitFor("bundleComplete");
			await seed({
				"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						return new Response("fixed")
					}
				} satisfies ExportedHandler
			`,
			});
			expect(
				findSourceFile((await recovered).bundle.entrypointSource, "index.ts")
			).toContain("fixed");
		});

		test("multiple ts source files", async ({ expect }) => {
			await seed({
				"src/index.ts": dedent /* javascript */ `
				import name from "./other"
				export default {
					fetch(request, env, ctx) {
						//comment
						return new Response("hello world" + name)
					}
				} satisfies ExportedHandler
			`,
				"src/other.ts": dedent /* javascript */ `
				export default "someone"
			`,
			});
			const config = configDefaults({
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),
			});

			let ev = bus.waitFor("bundleComplete");
			controller.onConfigUpdate({ type: "configUpdate", config });
			expect(findSourceFile((await ev).bundle.entrypointSource, "other.ts"))
				.toMatchInlineSnapshot(`
					"// other.ts
					var other_default = "someone";
					"
				`);
			expect(findSourceFile((await ev).bundle.entrypointSource, "index.ts"))
				.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					"
				`);

			// Now update the secondary source file and see that we re-bundle
			ev = bus.waitFor("bundleComplete");
			await seed({
				"src/other.ts": dedent /* javascript */ `
					export default "someone else"
				`,
			});
			expect(findSourceFile((await ev).bundle.entrypointSource, "other.ts"))
				.toMatchInlineSnapshot(`
					"// other.ts
					var other_default = "someone else";
					"
				`);
		});

		test("custom build", async ({ expect }) => {
			await seed({
				"custom_build_dir/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						//comment
						return new Response("hello custom build")
					}
				} satisfies ExportedHandler
			`,
			});
			const config = configDefaults({
				entrypoint: path.resolve("out.ts"),
				projectRoot: path.resolve("."),
				build: {
					custom: {
						command: `node -e "fs.cpSync('custom_build_dir/index.ts', 'out.ts')"`,
						watch: "custom_build_dir",
					},
					moduleRoot: path.resolve("."),
				},
			});

			let ev = bus.waitFor("bundleComplete");
			controller.onConfigUpdate({ type: "configUpdate", config });
			expect(findSourceFile((await ev).bundle.entrypointSource, "out.ts"))
				.toMatchInlineSnapshot(`
					"// out.ts
					var out_exports = {};
					__export(out_exports, {
					  default: () => out_default
					});
					var out_default = {
					  fetch(request, env, ctx) {
					    return new Response("hello custom build");
					  }
					};
					"
				`);

			await vi.waitFor(
				async () => {
					ev = bus.waitFor("bundleComplete");
					await seed({
						"custom_build_dir/index.ts": dedent /* javascript */ `
						export default {
							fetch(request, env, ctx) {
								//comment
								return new Response("hello custom build 2")
							}
						}
					`,
					});
					await ev;
					expect(findSourceFile((await ev).bundle.entrypointSource, "out.ts"))
						.toMatchInlineSnapshot(`
							"// out.ts
							var out_exports = {};
							__export(out_exports, {
							  default: () => out_default
							});
							var out_default = {
							  fetch(request, env, ctx) {
							    return new Response("hello custom build 2");
							  }
							};
							"
						`);
				},
				{ timeout: 5_000, interval: 500 }
			);
		});

		test("a burst of watched file changes does not run custom builds concurrently", async ({
			expect,
		}) => {
			await seed({
				// Records an overlap in `overlap.txt` if another custom build process is
				// still running when this one starts.
				//
				// A build that is superseded part way through is killed, leaving
				// `build.lock` behind, so the recorded pid is checked for liveness
				// rather than treating the presence of the lock as an overlap.
				"build.js": dedent /* javascript */ `
					const fs = require("node:fs");

					if (fs.existsSync("build.lock")) {
						const pid = Number(fs.readFileSync("build.lock", "utf8"));
						let running = true;
						try {
							process.kill(pid, 0);
						} catch {
							running = false;
						}
						if (running) {
							fs.writeFileSync("overlap.txt", String(pid));
							process.exit(1);
						}
					}

					fs.writeFileSync("build.lock", String(process.pid));
					setTimeout(() => {
						fs.cpSync("custom_build_dir/index.ts", "out.ts");
						fs.rmSync("build.lock");
					}, 300);
				`,
				"custom_build_dir/index.ts": dedent /* javascript */ `
					export default {
						fetch() {
							return new Response("hello custom build")
						}
					} satisfies ExportedHandler
				`,
			});
			const config = configDefaults({
				entrypoint: path.resolve("out.ts"),
				projectRoot: path.resolve("."),
				build: {
					custom: {
						command: "node build.js",
						watch: "custom_build_dir",
					},
					moduleRoot: path.resolve("."),
				},
			});

			const firstBuild = bus.waitFor("bundleComplete");
			controller.onConfigUpdate({ type: "configUpdate", config });
			await firstBuild;

			const bundleStartCount = () =>
				bus.events.filter((event) => event.type === "bundleStart").length;
			const buildsBeforeChanges = bundleStartCount();

			// Simulate the burst of watcher events produced by something like a
			// `git pull` touching several files at once.
			await seed(
				Object.fromEntries(
					Array.from({ length: 5 }, (_, i) => [
						`custom_build_dir/change-${i}.txt`,
						String(i),
					])
				)
			);

			// Wait for the builds triggered by the burst to settle, which we treat as
			// two consecutive polls seeing the same number of builds. We deliberately
			// don't wait for `bundleComplete`: overlapping builds make the last build
			// fail, and the assertions below report that far more usefully than the
			// test timing out.
			let previousCount = -1;
			await vi.waitFor(
				() => {
					const count = bundleStartCount();
					const settled =
						count > buildsBeforeChanges && count === previousCount;
					previousCount = count;
					if (!settled) {
						throw new Error(
							`Custom builds have not settled yet (${count - buildsBeforeChanges} started since the file changes)`
						);
					}
				},
				{ timeout: 8_000, interval: 500 }
			);

			expect(existsSync("overlap.txt")).toBe(false);
			expect(
				bus.events.filter(
					(event) =>
						event.type === "error" &&
						event.source === "BundlerController" &&
						event.reason === "Custom build failed"
				)
			).toEqual([]);
			// The burst is debounced, so it must not produce a build per changed file
			expect(bundleStartCount() - buildsBeforeChanges).toBeLessThan(5);
		});

		test("teardown aborts an in-flight watched custom build", async ({
			expect,
		}) => {
			await seed({
				"build.js": dedent /* javascript */ `
					const fs = require("node:fs");
					fs.writeFileSync("out.ts", "export default { fetch() { return new Response('done') } };");
					console.log("custom build started");
					process.on("SIGTERM", () => {
						fs.writeFileSync("aborted.txt", "yes");
						process.exit(0);
					});
					setTimeout(() => {
						fs.writeFileSync("completed.txt", "yes");
						process.exit(0);
					}, 10_000);
					setInterval(() => {}, 1000);
				`,
				"custom_build_dir/index.ts": dedent /* javascript */ `
					export default {
						fetch() {
							return new Response("initial")
						}
					}
				`,
			});
			const config = configDefaults({
				entrypoint: path.resolve("out.ts"),
				projectRoot: path.resolve("."),
				build: {
					custom: {
						command: "node build.js",
						watch: "custom_build_dir",
					},
					moduleRoot: path.resolve("."),
				},
			});

			controller.onConfigUpdate({ type: "configUpdate", config });
			await vi.waitFor(() => {
				const buildStartedEvents = bus.events.filter(
					(event) => event.type === "bundleStart"
				);
				expect(buildStartedEvents).toHaveLength(1);
			});

			await controller.teardown();
			// On POSIX the build process is sent SIGTERM and can run its handler to
			// shut down gracefully. Windows has no graceful signal for console
			// processes, so `tree-kill` force-terminates the tree (`taskkill /F`) and
			// the SIGTERM handler never runs. Either way the build must be aborted
			// before it completes, which is what `completed.txt` verifies below.
			if (process.platform !== "win32") {
				expect(existsSync("aborted.txt")).toBe(true);
			}
			expect(existsSync("completed.txt")).toBe(false);
			expect(
				bus.events.some(
					(event) =>
						event.type === "error" && event.source === "BundlerController"
				)
			).toBe(false);
		});

		// `DevEnv` tears its controllers down concurrently, and `ConfigController` can
		// dispatch a config-file change that was delivered while its own watcher was
		// closing, so a config update can reach the bundler after it has torn down.
		// Acting on one leaks watchers, an esbuild watch build and a temp directory
		// that nothing will ever clean up, and can keep the process alive.
		const postTeardownCases = [
			{
				name: "watched custom build",
				build: {
					custom: { command: "node build.js", watch: "custom_build_dir" },
				},
			},
			{
				name: "unwatched custom build",
				dev: { watch: false },
				build: {
					custom: { command: "node build.js", watch: "custom_build_dir" },
				},
			},
			{
				name: "esbuild bundler",
				entrypoint: path.resolve("custom_build_dir/index.ts"),
			},
		];

		for (const testCase of postTeardownCases) {
			test(`a config update after teardown is ignored (${testCase.name})`, async ({
				expect,
			}) => {
				await seed({
					"build.js": dedent /* javascript */ `
						const fs = require("node:fs");
						fs.writeFileSync("built.txt", "yes");
						fs.cpSync("custom_build_dir/index.ts", "out.ts");
					`,
					"custom_build_dir/index.ts": dedent /* javascript */ `
						export default {
							fetch() {
								return new Response("initial")
							}
						}
					`,
				});
				const config = configDefaults({
					entrypoint: path.resolve("out.ts"),
					projectRoot: path.resolve("."),
					...testCase,
					build: { moduleRoot: path.resolve("."), ...testCase.build },
				});

				await controller.teardown();
				controller.onConfigUpdate({ type: "configUpdate", config });
				await setTimeout(500);

				// Nothing may run the user's build command or report to the torn-down bus
				expect(existsSync("built.txt")).toBe(false);
				expect(
					bus.events.filter(
						(event) =>
							event.type === "bundleStart" || event.type === "bundleComplete"
					)
				).toEqual([]);
				// ...nor create resources that nothing is left to clean up
				expect(wranglerTmpDirs()).toEqual([]);
			});
		}
	});

	test("module aliasing", async ({ expect }) => {
		await seed({
			"src/index.ts": dedent /* javascript */ `
				import name from "foo"
				export default {
					fetch(request, env, ctx) {
						//comment
						return new Response("hello world" + name)
					}
				} satisfies ExportedHandler
			`,
			"node_modules/foo": dedent /* javascript */ `
				export default "foo"
			`,
			"node_modules/bar": dedent /* javascript */ `
				export default "bar"
			`,
		});
		const config = configDefaults({
			entrypoint: path.resolve("src/index.ts"),
			projectRoot: path.resolve("src"),
		});
		let ev = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({ type: "configUpdate", config });

		expect((await ev).bundle.entrypointSource).toContain(dedent`
            // ../node_modules/foo
            var foo_default = "foo"
        `);

		ev = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({
			type: "configUpdate",
			config: {
				...config,
				build: {
					...config.build,
					alias: {
						foo: "bar",
					},
				},
			},
		});
		expect((await ev).bundle.entrypointSource).toContain(dedent`
            // ../node_modules/bar
            var bar_default = "bar"
        `);
	});

	describe("switching", () => {
		test(
			"esbuild -> custom builds",
			{ timeout: 500000 },
			async ({ expect }) => {
				await seed({
					"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						//comment
						return new Response("hello world")
					}
				} satisfies ExportedHandler
			`,
				});
				const config = configDefaults({
					entrypoint: path.resolve("src/index.ts"),
					projectRoot: path.resolve("src"),
				});

				const ev = bus.waitFor("bundleComplete", undefined, 500000);
				controller.onConfigUpdate({
					type: "configUpdate",
					config: configDefaults(config),
				});
				expect(findSourceFile((await ev).bundle.entrypointSource, "index.ts"))
					.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response("hello world");
					  }
					};
					"
				`);

				// Now switch to custom builds and see that it rebundles
				await seed({
					"custom_build_dir/index.ts": dedent /* javascript */ `
					export default {
						fetch(request, env, ctx) {
							//comment
							return new Response("hello custom build")
						}
					} satisfies ExportedHandler
				`,
				});
				const configCustom = configDefaults({
					entrypoint: path.resolve("out.ts"),
					projectRoot: path.resolve("."),
					build: {
						custom: {
							command: `node -e "fs.cpSync('custom_build_dir/index.ts', 'out.ts')"`,
							watch: "custom_build_dir",
						},
						moduleRoot: path.resolve("."),
					},
				});

				const evCustom = bus.waitFor("bundleComplete", undefined, 500000);
				controller.onConfigUpdate({
					type: "configUpdate",
					config: configCustom,
				});
				expect(
					findSourceFile((await evCustom).bundle.entrypointSource, "out.ts")
				).toMatchInlineSnapshot(`
					"// out.ts
					var out_exports = {};
					__export(out_exports, {
					  default: () => out_default
					});
					var out_default = {
					  fetch(request, env, ctx) {
					    return new Response("hello custom build");
					  }
					};
					"
				`);

				await vi.waitFor(
					async () => {
						// Make sure we are now watching and processing the custom builds after switching to them
						const updatedSource = bus.waitFor(
							"bundleComplete",
							undefined,
							500000
						);
						await seed({
							"custom_build_dir/index.ts": dedent /* javascript */ `
						export default {
							fetch(request, env, ctx) {
								//comment
								return new Response("hello custom build 2")
							}
						}
					`,
						});
						expect(
							findSourceFile(
								(await updatedSource).bundle.entrypointSource,
								"out.ts"
							)
						).toMatchInlineSnapshot(`
						"// out.ts
						var out_exports = {};
						__export(out_exports, {
						  default: () => out_default
						});
						var out_default = {
						  fetch(request, env, ctx) {
						    return new Response("hello custom build 2");
						  }
						};
						"
					`);
					},
					{ timeout: 5_000, interval: 500 }
				);
			}
		);

		test("custom builds -> esbuild", async ({ expect }) => {
			await seed({
				"custom_build_dir/index.ts": dedent /* javascript */ `
					export default {
						fetch(request, env, ctx) {
							//comment
							return new Response("hello custom build")
						}
					} satisfies ExportedHandler
				`,
			});
			const configCustom = configDefaults({
				entrypoint: path.resolve("out.ts"),
				projectRoot: process.cwd(),
				build: {
					custom: {
						command: `node -e "fs.cpSync('custom_build_dir/index.ts', 'out.ts')"`,
						watch: "custom_build_dir",
					},
					moduleRoot: process.cwd(),
				},
			});

			const evCustom = bus.waitFor("bundleComplete");
			await controller.onConfigUpdate({
				type: "configUpdate",
				config: configCustom,
			});

			expect(findSourceFile((await evCustom).bundle.entrypointSource, "out.ts"))
				.toMatchInlineSnapshot(`
					"// out.ts
					var out_exports = {};
					__export(out_exports, {
					  default: () => out_default
					});
					var out_default = {
					  fetch(request, env, ctx) {
					    return new Response("hello custom build");
					  }
					};
					"
				`);
			await seed({
				"src/index.ts": dedent /* javascript */ `
						export default {
							fetch(request, env, ctx) {
								//comment
								return new Response("hello world")
							}
						} satisfies ExportedHandler
					`,
			});

			const config = configDefaults({
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),
			});

			let ev = bus.waitFor("bundleComplete");
			controller.onConfigUpdate({
				type: "configUpdate",
				config: configDefaults(config),
			});

			expect(findSourceFile((await ev).bundle.entrypointSource, "index.ts"))
				.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response("hello world");
					  }
					};
					"
				`);

			// Now change the source file and see that we still rebundle
			ev = bus.waitFor("bundleComplete");
			await seed({
				"src/index.ts": dedent /* javascript */ `
						export default {
							fetch(request, env, ctx) {
								//comment
								return new Response("hello world 2")
							}
						} satisfies ExportedHandler
					`,
			});
			expect(findSourceFile((await ev).bundle.entrypointSource, "index.ts"))
				.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response("hello world 2");
					  }
					};
					"
				`);
		});
	});

	describe("bundling error messages", () => {
		test("should recommend alias when a non-Node module cannot be resolved", async ({
			expect,
		}) => {
			await seed({
				"src/index.ts": dedent /* javascript */ `
					import foo from 'some-nonexistent-module';
					export default {
						fetch(request, env, ctx) {
							return new Response(foo)
						}
					} satisfies ExportedHandler
				`,
			});
			const config = configDefaults({
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),
			});
			const ev = bus.waitFor("error", (e) => e.source === "BundlerController");
			controller.onConfigUpdate({ type: "configUpdate", config });
			const error = await ev;

			const buildFailure = error.cause as esbuild.BuildFailure;
			const formattedError = normalizeString(
				esbuild
					.formatMessagesSync(buildFailure.errors ?? [], { kind: "error" })
					.join()
					.trim()
			);

			expect(formattedError).toMatchInlineSnapshot(`
				"X [ERROR] Could not resolve "some-nonexistent-module"

				    index.ts:1:16:
				      1 │ import foo from 'some-nonexistent-module';
				        ╵                 ~~~~~~~~~~~~~~~~~~~~~~~~~

				  To fix this, you can add an entry to "alias" in your Wrangler configuration.
				  For more guidance see: https://developers.cloudflare.com/workers/wrangler/configuration/#bundling-issues"
			`);
		});

		test("should NOT recommend alias for Node built-in modules", async ({
			expect,
		}) => {
			await seed({
				"src/index.ts": dedent /* javascript */ `
					import fs from 'fs';
					export default {
						fetch(request, env, ctx) {
							return new Response(String(fs))
						}
					} satisfies ExportedHandler
				`,
			});
			const config = configDefaults({
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),
			});
			const ev = bus.waitFor("error", (e) => e.source === "BundlerController");
			controller.onConfigUpdate({ type: "configUpdate", config });
			const error = await ev;

			const buildFailure = error.cause as esbuild.BuildFailure;
			const formattedError = normalizeString(
				esbuild
					.formatMessagesSync(buildFailure.errors ?? [], { kind: "error" })
					.join()
					.trim()
			);

			expect(formattedError).toMatchInlineSnapshot(`
				"X [ERROR] Could not resolve "fs"

				    index.ts:1:15:
				      1 │ import fs from 'fs';
				        ╵                ~~~~

				  The package "fs" wasn't found on the file system but is built into node.
				  - Add the "nodejs_compat" compatibility flag to your project."
			`);
		});
	});
});
