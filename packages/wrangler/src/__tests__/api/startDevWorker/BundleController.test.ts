import { once } from "events";
import path from "path";
import dedent from "ts-dedent";
import { test as base, describe } from "vitest";
import { BundlerController } from "../../../api/startDevWorker/BundlerController";
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

const test = base.extend<{ controller: BundlerController }>({
	// eslint-disable-next-line no-empty-pattern
	controller: async ({}, use) => {
		const controller = new BundlerController();

		await use(controller);

		await controller.teardown();
	},
});

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
		entrypoint: "NOT_REAL",
		directory: "NOT_REAL",
		build: unusable<StartDevWorkerOptions["build"]>(),
		legacy: {},
		dev: { persist },
		...config,
	};
}
describe("happy path bundle + watch", () => {
	runInTempDir();
	test("single ts source file", async ({ controller }) => {
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
			directory: path.resolve("src"),
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
				var src_default = {
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
				var src_default = {
				  fetch(request, env, ctx) {
				    return new Response(\\"hello world 2\\");
				  }
				};
				"
			`);
	});
	test("multiple ts source files", async ({ controller }) => {
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
			directory: path.resolve("src"),
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
				var src_default = {
				  fetch(request, env, ctx) {
				    return new Response(\\"hello world\\" + other_default);
				  }
				};
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

	test("custom build", async ({ controller }) => {
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
			directory: path.resolve("."),
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
				var out_default = {
				  fetch(request, env, ctx) {
				    return new Response(\\"hello custom build\\");
				  }
				};
				"
			`);
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
				var out_default = {
				  fetch(request, env, ctx) {
				    return new Response(\\"hello custom build 2\\");
				  }
				};
				"
			`);
	});
});

describe("switching", () => {
	runInTempDir();
	test("esbuild -> custom builds", async ({ controller }) => {
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
			directory: path.resolve("src"),

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
				var src_default = {
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
			directory: process.cwd(),
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
			},
			legacy: {},
		};

		await controller.onConfigUpdate({
			type: "configUpdate",
			config: configDefaults(configCustom),
		});

		let evCustom = await waitForBundleComplete(controller);
		expect(findSourceFile(evCustom.bundle.entrypointSource, "out.ts"))
			.toMatchInlineSnapshot(`
				"// out.ts
				var out_default = {
				  fetch(request, env, ctx) {
				    return new Response(\\"hello custom build\\");
				  }
				};
				"
			`);
		// Make sure custom builds can reload after switching to them
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
		evCustom = await waitForBundleComplete(controller);
		expect(findSourceFile(evCustom.bundle.entrypointSource, "out.ts"))
			.toMatchInlineSnapshot(`
				"// out.ts
				var out_default = {
				  fetch(request, env, ctx) {
				    return new Response(\\"hello custom build 2\\");
				  }
				};
				"
			`);
	});

	test("custom builds -> esbuild", async ({ controller }) => {
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
			directory: process.cwd(),

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
			directory: path.resolve("src"),

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
				var src_default = {
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
				var src_default = {
				  fetch(request, env, ctx) {
				    return new Response(\\"hello world 2\\");
				  }
				};
				"
			`);
	});
});
