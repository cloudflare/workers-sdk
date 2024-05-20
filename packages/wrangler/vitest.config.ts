import path from "path";
import * as esbuild from "esbuild";
import { dedent } from "ts-dedent";
import { defineConfig } from "vitest/config";
import type { BuildContext } from "esbuild";
import type { Plugin } from "vite";

const TEMPLATES_DIR = path.join(__dirname, "templates");

const workersContexts = new Map<string, BuildContext>();
// const embedWorkersPlugin: Plugin = {
// 	name: "embed-workers",
// 	setup(build) {
// 		const namespace = "embed-worker";
// 		build.onResolve({ filter: /^worker:/ }, async (args) => {
// 			const name = args.path.substring("worker:".length);
// 			// Use `build.resolve()` API so Workers can be written as `m?[jt]s` files
// 			const result = await build.resolve("./" + name, {
// 				kind: "import-statement",
// 				resolveDir: TEMPLATES_DIR,
// 			});
// 			if (result.errors.length > 0) {
// 				return { errors: result.errors };
// 			}
// 			return { path: result.path, namespace };
// 		});
// 		build.onLoad({ filter: /.*/, namespace }, async (args) => {
// 			const ctx =
// 				workersContexts.get(args.path) ??
// 				(await esbuild.context({
// 					platform: "node", // Marks `node:*` imports as external
// 					format: "esm",
// 					target: "esnext",
// 					bundle: true,
// 					sourcemap: true,
// 					sourcesContent: false,
// 					metafile: true,
// 					entryPoints: [args.path],
// 					outdir: build.initialOptions.outdir,
// 				}));
// 			const result = await ctx.rebuild();
// 			workersContexts.set(args.path, ctx);
// 			const watchFiles = Object.keys(result?.metafile?.inputs ?? {});
// 			const scriptPath = Object.keys(result?.metafile?.outputs ?? {}).find(
// 				(filepath) => filepath.endsWith(".js")
// 			);

// 			const contents = `
// 				import path from "node:path";
// 				const scriptPath = path.resolve(__dirname, "..", "${scriptPath}");
// 				export default scriptPath;
//             `;

// 			return { contents, loader: "js", watchFiles };
// 		});
// 	},
// };

function embedWorkersPlugin(): Plugin {
	return {
		name: "embed-workers",

		async resolveId(id) {
			if (id.startsWith("worker:")) {
				const name = id.substring("worker:".length);

				return `\0worker:${path.join(TEMPLATES_DIR, name)}.ts`;
			}
		},
		async load(id) {
			if (!id.startsWith(`\0worker:`)) {
				return null;
			}
			id = id.substring(`\0worker:`.length);
			const ctx =
				workersContexts.get(id) ??
				(await esbuild.context({
					platform: "node", // Marks `node:*` imports as external
					format: "esm",
					target: "esnext",
					bundle: true,
					sourcemap: true,
					sourcesContent: false,
					metafile: true,
					entryPoints: [id],
				}));
			const result = await ctx.rebuild();
			workersContexts.set(id, ctx);
			const watchFiles = Object.keys(result?.metafile?.inputs ?? {});
			const scriptPath = Object.keys(result?.metafile?.outputs ?? {}).find(
				(filepath) => filepath.endsWith(".js")
			);

			for (const file of watchFiles) {
				this.addWatchFile(file);
			}

			return dedent/*javascript*/ `
			import path from "node:path";
			const scriptPath = path.resolve(__dirname, "..", "${scriptPath}");
			export default scriptPath;`;
		},
	};
}

export default defineConfig({
	plugins: [embedWorkersPlugin()],
	test: {
		testTimeout: 50_000,
		pool: "forks",
		retry: 0,
		include: ["**/__tests__/**/*.test.ts"],
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		outputFile: process.env.TEST_REPORT_PATH ?? ".e2e-test-report/index.html",
		setupFiles: path.resolve(__dirname, "src/__tests__/vitest.setup.ts"),
		reporters: ["default", "html"],
		globals: true,
		snapshotFormat: {
			escapeString: true,
			printBasicPrototype: true,
		},
	},
});
