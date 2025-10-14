import { once } from "events";
import path from "path";
import dedent from "ts-dedent";
import { describe, test } from "vitest";
import { BundlerController } from "../../../api/startDevWorker/BundlerController";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { seed } from "../../helpers/seed";
import { unusable } from "../../helpers/unusable";
import type { BundleCompleteEvent, StartDevWorkerOptions } from "../../../api";

// Find the bundled result of a particular source file
function findSourceFile(source: string, name: string): string {
	const startIndex = source.indexOf(`// ${name}`);
	const endIndex = source.indexOf("\n//", startIndex);
	return source.slice(startIndex, endIndex);
}

async function waitForBundleComplete(
	controller: BundlerController
): Promise<BundleCompleteEvent> {
	const [event] = await once(controller, "bundleComplete");
	return event;
}

function configDefaults(
	config: Partial<StartDevWorkerOptions>
): StartDevWorkerOptions {
	const persist = path.join(process.cwd(), ".wrangler/persist");
	return {
		name: "test-worker",
		complianceRegion: undefined,
		entrypoint: "NOT_REAL",
		projectRoot: "NOT_REAL",
		build: unusable<StartDevWorkerOptions["build"]>(),
		legacy: {},
		dev: { persist },
		...config,
	};
}

describe("BundleController", () => {
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
	let controller: BundlerController;
	beforeEach(() => {
		controller = new BundlerController();
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
			const config: Partial<StartDevWorkerOptions> = {
				legacy: {},
				name: "worker",
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),
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
				},
			};

			await controller.onConfigUpdate({
				type: "configUpdate",
				config: configDefaults(config),
			});

			let ev = await waitForBundleComplete(controller);
			expect(findSourceFile(ev.bundle.entrypointSource, "index.ts"))
				.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello world\\");
					  }
					};
					"
				`);
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
			ev = await waitForBundleComplete(controller);
			expect(findSourceFile(ev.bundle.entrypointSource, "index.ts"))
				.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello world 2\\");
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
			const config: Partial<StartDevWorkerOptions> = {
				legacy: {},
				name: "worker",
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),
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
				},
			};

			await controller.onConfigUpdate({
				type: "configUpdate",
				config: configDefaults(config),
			});

			let ev = await waitForBundleComplete(controller);
			expect(findSourceFile(ev.bundle.entrypointSource, "other.ts"))
				.toMatchInlineSnapshot(`
				"// other.ts
				var other_default = \\"someone\\";
				"
			`);
			expect(findSourceFile(ev.bundle.entrypointSource, "index.ts"))
				.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					"
				`);
			await seed({
				"src/other.ts": dedent/* javascript */ `
					export default "someone else"
				`,
			});
			ev = await waitForBundleComplete(controller);
			expect(findSourceFile(ev.bundle.entrypointSource, "other.ts"))
				.toMatchInlineSnapshot(`
				"// other.ts
				var other_default = \\"someone else\\";
				"
			`);
		});

		test("custom build", async () => {
			await seed({
				"random_dir/index.ts": dedent/* javascript */ `
				export default {
					fetch(request, env, ctx) {
						//comment
						return new Response("hello custom build")
					}
				} satisfies ExportedHandler
			`,
			});
			const config: Partial<StartDevWorkerOptions> = {
				legacy: {},
				name: "worker",
				entrypoint: path.resolve("out.ts"),
				projectRoot: path.resolve("."),
				build: {
					additionalModules: [],
					processEntrypoint: false,
					nodejsCompatMode: null,
					bundle: true,
					moduleRules: [],
					custom: {
						command: "cp random_dir/index.ts out.ts",
						watch: "random_dir",
					},
					define: {},
					format: "modules",
					moduleRoot: path.resolve("."),
					exports: [],
				},
			};

			await controller.onConfigUpdate({
				type: "configUpdate",
				config: configDefaults(config),
			});

			let ev = await waitForBundleComplete(controller);
			expect(findSourceFile(ev.bundle.entrypointSource, "out.ts"))
				.toMatchInlineSnapshot(`
					"// out.ts
					var out_exports = {};
					__export(out_exports, {
					  default: () => out_default
					});
					var out_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello custom build\\");
					  }
					};
					"
				`);

			// Wait for a bit before we make a new change to the watched file
			await sleep(500);

			await seed({
				"random_dir/index.ts": dedent/* javascript */ `
					export default {
						fetch(request, env, ctx) {
							//comment
							return new Response("hello custom build 2")
						}
					}
				`,
			});
			ev = await waitForBundleComplete(controller);
			expect(findSourceFile(ev.bundle.entrypointSource, "out.ts"))
				.toMatchInlineSnapshot(`
					"// out.ts
					var out_exports = {};
					__export(out_exports, {
					  default: () => out_default
					});
					var out_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello custom build 2\\");
					  }
					};
					"
				`);
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
			legacy: {},
			name: "worker",
			entrypoint: path.resolve("src/index.ts"),
			projectRoot: path.resolve("src"),
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
			},
		});

		await controller.onConfigUpdate({ type: "configUpdate", config });

		let ev = await waitForBundleComplete(controller);
		expect(ev.bundle.entrypointSource).toContain(dedent/* javascript */ `
            // ../node_modules/foo
            var foo_default = "foo"
        `);

		await controller.onConfigUpdate({
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
		ev = await waitForBundleComplete(controller);
		expect(ev.bundle.entrypointSource).toContain(dedent/* javascript */ `
            // ../node_modules/bar
            var bar_default = "bar"
        `);
	});

	describe("switching", () => {
		test("esbuild -> custom builds", async () => {
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
			const config: Partial<StartDevWorkerOptions> = {
				legacy: {},
				name: "worker",
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),

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
				},
			};

			await controller.onConfigUpdate({
				type: "configUpdate",
				config: configDefaults(config),
			});

			const ev = await waitForBundleComplete(controller);
			expect(findSourceFile(ev.bundle.entrypointSource, "index.ts"))
				.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello world\\");
					  }
					};
					"
				`);

			await seed({
				"random_dir/index.ts": dedent/* javascript */ `
					export default {
						fetch(request, env, ctx) {
							//comment
							return new Response("hello custom build")
						}
					} satisfies ExportedHandler
				`,
			});
			const configCustom: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: path.resolve("out.ts"),
				projectRoot: process.cwd(),
				build: {
					additionalModules: [],
					processEntrypoint: false,
					nodejsCompatMode: null,
					bundle: true,
					moduleRules: [],
					custom: {
						command: "cp random_dir/index.ts out.ts",
						watch: "random_dir",
					},
					define: {},
					format: "modules",
					moduleRoot: process.cwd(),
					exports: [],
				},
				legacy: {},
			};

			let evCustomPromise = waitForBundleComplete(controller);
			await controller.onConfigUpdate({
				type: "configUpdate",
				config: configDefaults(configCustom),
			});
			let evCustom = await evCustomPromise;

			expect(findSourceFile(evCustom.bundle.entrypointSource, "out.ts"))
				.toMatchInlineSnapshot(`
					"// out.ts
					var out_exports = {};
					__export(out_exports, {
					  default: () => out_default
					});
					var out_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello custom build\\");
					  }
					};
					"
				`);

			// Make sure custom builds can reload after switching to them
			evCustomPromise = waitForBundleComplete(controller);
			await seed({
				"random_dir/index.ts": dedent/* javascript */ `
						export default {
							fetch(request, env, ctx) {
								//comment
								return new Response("hello custom build 2")
							}
						}
					`,
			});
			evCustom = await evCustomPromise;
			expect(findSourceFile(evCustom.bundle.entrypointSource, "out.ts"))
				.toMatchInlineSnapshot(`
					"// out.ts
					var out_exports = {};
					__export(out_exports, {
					  default: () => out_default
					});
					var out_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello custom build 2\\");
					  }
					};
					"
				`);
		});

		test("custom builds -> esbuild", async () => {
			await seed({
				"random_dir/index.ts": dedent/* javascript */ `
					export default {
						fetch(request, env, ctx) {
							//comment
							return new Response("hello custom build")
						}
					} satisfies ExportedHandler
				`,
			});
			const configCustom: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: path.resolve("out.ts"),
				projectRoot: process.cwd(),

				build: {
					additionalModules: [],
					processEntrypoint: false,
					nodejsCompatMode: null,
					bundle: true,
					moduleRules: [],
					custom: {
						command: "cp random_dir/index.ts out.ts",
						watch: "random_dir",
					},
					define: {},
					format: "modules",
					moduleRoot: process.cwd(),
					exports: [],
				},
			};

			await controller.onConfigUpdate({
				type: "configUpdate",
				config: configDefaults(configCustom),
			});

			const evCustom = await waitForBundleComplete(controller);
			expect(findSourceFile(evCustom.bundle.entrypointSource, "out.ts"))
				.toMatchInlineSnapshot(`
					"// out.ts
					var out_exports = {};
					__export(out_exports, {
					  default: () => out_default
					});
					var out_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello custom build\\");
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
			const config: Partial<StartDevWorkerOptions> = {
				legacy: {},
				name: "worker",
				entrypoint: path.resolve("src/index.ts"),
				projectRoot: path.resolve("src"),

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
				},
			};

			await controller.onConfigUpdate({
				type: "configUpdate",
				config: configDefaults(config),
			});

			let ev = await waitForBundleComplete(controller);
			expect(findSourceFile(ev.bundle.entrypointSource, "index.ts"))
				.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello world\\");
					  }
					};
					"
				`);
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
			ev = await waitForBundleComplete(controller);
			expect(findSourceFile(ev.bundle.entrypointSource, "index.ts"))
				.toMatchInlineSnapshot(`
					"// index.ts
					var index_exports = {};
					__export(index_exports, {
					  default: () => index_default
					});
					var index_default = {
					  fetch(request, env, ctx) {
					    return new Response(\\"hello world 2\\");
					  }
					};
					"
				`);
		});
	});
});

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
