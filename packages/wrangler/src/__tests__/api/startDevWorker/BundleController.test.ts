import { once } from "events";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import dedent from "ts-dedent";
import { test as base, describe } from "vitest";
import { BundlerController } from "../../../api/startDevWorker/BundlerController";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { unusable } from "../../helpers/unusable";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	StartDevWorkerOptions,
} from "../../../api";
import type { ExpectStatic } from "vitest";

type _BundleConfig = Pick<
	StartDevWorkerOptions,
	| "_entry"
	| "_additionalModules"
	| "build"
	| "_processEntrypoint"
	| "_assets"
	| "_serveAssetsFromWorker"
	| "_legacyNodeCompat"
	| "compatibilityFlags"
	| "compatibilityDate"
	| "_bindings"
	| "dev"
	| "_projectRoot"
>;

// Make entrypoint snapshots slightly more readable and relevant
function stripMiddleware(source: string, name: string): string {
	const startIndex = source.indexOf(`// ${name}`);
	const endIndex = source.indexOf("\n//", startIndex);
	return source.slice(startIndex, endIndex);
}
// Seeds the `root` directory on the file system with some data. Use in
// combination with `dedent` for petty formatting of seeded contents.
export async function seed(files: Record<string, string | Uint8Array>) {
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(name);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, contents);
	}
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

async function waitForBundleStart(
	controller: BundlerController
): Promise<BundleStartEvent> {
	const [event] = await once(controller, "bundleStart");
	return event;
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
		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			_entry: {
				file: path.resolve("src/index.ts"),
				directory: path.resolve("src"),
				format: "modules",
				moduleRoot: path.resolve("src"),
				name: "worker-name",
			},
			_additionalModules: [],
			build: {
				bundle: true,
				moduleRules: [],
				custom: {},
				define: {},
			},
		};

		await controller.onConfigUpdate({
			type: "configUpdate",
			config,
		});

		let ev = await waitForBundleComplete(controller);
		expect(stripMiddleware(ev.bundle.entrypointSource, "index.ts"))
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
		expect(stripMiddleware(ev.bundle.entrypointSource, "index.ts"))
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
		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			_entry: {
				file: path.resolve("src/index.ts"),
				directory: path.resolve("src"),
				format: "modules",
				moduleRoot: path.resolve("src"),
				name: "worker-name",
			},
			_additionalModules: [],
			build: {
				bundle: true,
				moduleRules: [],
				custom: {},
				define: {},
			},
		};

		await controller.onConfigUpdate({
			type: "configUpdate",
			config,
		});

		let ev = await waitForBundleComplete(controller);
		expect(stripMiddleware(ev.bundle.entrypointSource, "other.ts"))
			.toMatchInlineSnapshot(`
				"// other.ts
				var other_default = \\"someone\\";
				"
			`);
		expect(stripMiddleware(ev.bundle.entrypointSource, "index.ts"))
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
		expect(stripMiddleware(ev.bundle.entrypointSource, "other.ts"))
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
		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			_entry: {
				file: path.resolve("out.ts"),
				directory: path.resolve("."),
				format: "modules",
				moduleRoot: path.resolve("."),
				name: "worker-name",
			},
			_additionalModules: [],
			build: {
				bundle: true,
				moduleRules: [],
				custom: {
					command: "cp random_dir/index.ts out.ts",
					watch: "random_dir",
				},
				define: {},
			},
		};

		await controller.onConfigUpdate({
			type: "configUpdate",
			config,
		});

		let ev = await waitForBundleComplete(controller);
		expect(stripMiddleware(ev.bundle.entrypointSource, "out.ts"))
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
		expect(stripMiddleware(ev.bundle.entrypointSource, "out.ts"))
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
	test.only("esbuild -> custom builds", async ({ controller }) => {
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
		let config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			_entry: {
				file: path.resolve("src/index.ts"),
				directory: path.resolve("src"),
				format: "modules",
				moduleRoot: path.resolve("src"),
				name: "worker-name",
			},
			_additionalModules: [],
			build: {
				bundle: true,
				moduleRules: [],
				custom: {},
				define: {},
			},
		};

		await controller.onConfigUpdate({
			type: "configUpdate",
			config,
		});

		let ev = await waitForBundleComplete(controller);
		expect(stripMiddleware(ev.bundle.entrypointSource, "index.ts"))
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
		const configCustom = {
			name: "worker",
			script: unusable(),
			_entry: {
				file: path.resolve("out.ts"),
				directory: process.cwd(),
				format: "modules",
				moduleRoot: process.cwd(),
				name: "worker-name",
			},
			_additionalModules: [],
			build: {
				bundle: true,
				moduleRules: [],
				custom: {
					command: "cp random_dir/index.ts out.ts",
					watch: "random_dir",
				},
				define: {},
			},
		};

		await controller.onConfigUpdate({
			type: "configUpdate",
			config: configCustom,
		});

		let evCustom = await waitForBundleComplete(controller);
		expect(stripMiddleware(evCustom.bundle.entrypointSource, "out.ts"))
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
		console.log(process.cwd());
		evCustom = await waitForBundleComplete(controller);
		expect(stripMiddleware(evCustom.bundle.entrypointSource, "out.ts"))
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
