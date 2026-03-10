import path from "node:path";
import { seed } from "@cloudflare/workers-utils/test-helpers";
import dedent from "ts-dedent";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in vi.waitFor callbacks */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { BundlerController } from "../../../api/startDevWorker/BundlerController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { runInTempDir } from "../../helpers/run-in-tmp";
import type { StartDevWorkerOptions } from "../../../api";

// Find the bundled result of a particular source file
function findSourceFile(source: string, name: string): string {
	const startIndex = source.indexOf(`// ${name}`);
	const endIndex = source.indexOf("\n//", startIndex);
	return source.slice(startIndex, endIndex);
}

function configDefaults(
	config: Partial<
		Omit<StartDevWorkerOptions, "build"> & {
			build: Partial<StartDevWorkerOptions["build"]>;
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
		dev: { persist },
		...config,
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
		test("single ts source file", async () => {
			await seed({
				"src/index.ts": dedent/* javascript */ `
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
			const ev = bus.waitFor("bundleComplete");
			controller.onConfigUpdate({ type: "configUpdate", config });
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

			// Now update the source file and see that we re-bundle
			const ev2 = bus.waitFor("bundleComplete");
			await seed({
				"src/index.ts": dedent/* javascript */ `
					export default {
						fetch(request, env, ctx) {
							//comment
							return new Response("hello world 2")
						}
					} satisfies ExportedHandler
				`,
			});
			expect(findSourceFile((await ev2).bundle.entrypointSource, "index.ts"))
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

		test("multiple ts source files", async () => {
			await seed({
				"src/index.ts": dedent/* javascript */ `
				import name from "./other"
				export default {
					fetch(request, env, ctx) {
						//comment
						return new Response("hello world" + name)
					}
				} satisfies ExportedHandler
			`,
				"src/other.ts": dedent/* javascript */ `
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
				"src/other.ts": dedent/* javascript */ `
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

		test("custom build", async () => {
			await seed({
				"custom_build_dir/index.ts": dedent/* javascript */ `
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
						"custom_build_dir/index.ts": dedent/* javascript */ `
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
	});

	test("module aliasing", async () => {
		await seed({
			"src/index.ts": dedent/* javascript */ `
				import name from "foo"
				export default {
					fetch(request, env, ctx) {
						//comment
						return new Response("hello world" + name)
					}
				} satisfies ExportedHandler
			`,
			"node_modules/foo": dedent/* javascript */ `
				export default "foo"
			`,
			"node_modules/bar": dedent/* javascript */ `
				export default "bar"
			`,
		});
		const config = configDefaults({
			entrypoint: path.resolve("src/index.ts"),
			projectRoot: path.resolve("src"),
		});
		let ev = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({ type: "configUpdate", config });

		expect((await ev).bundle.entrypointSource)
			.toContain(dedent/* javascript */ `
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
		expect((await ev).bundle.entrypointSource)
			.toContain(dedent/* javascript */ `
            // ../node_modules/bar
            var bar_default = "bar"
        `);
	});

	describe("switching", () => {
		test("esbuild -> custom builds", { timeout: 500000 }, async () => {
			await seed({
				"src/index.ts": dedent/* javascript */ `
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
				"custom_build_dir/index.ts": dedent/* javascript */ `
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

			await vi.waitFor(
				async () => {
					// Make sure we are now watching and processing the custom builds after switching to them
					const updatedSource = bus.waitFor(
						"bundleComplete",
						undefined,
						500000
					);
					await seed({
						"custom_build_dir/index.ts": dedent/* javascript */ `
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
		});

		test("custom builds -> esbuild", async () => {
			await seed({
				"custom_build_dir/index.ts": dedent/* javascript */ `
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
				"src/index.ts": dedent/* javascript */ `
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
				"src/index.ts": dedent/* javascript */ `
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
});
