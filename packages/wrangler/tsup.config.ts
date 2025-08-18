import path from "node:path";
import * as esbuild from "esbuild";
import { defineConfig } from "tsup";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps";
import type { Options } from "tsup";

const TEMPLATES_DIR = path.join(__dirname, "templates");
const workersContexts = new Map<string, esbuild.BuildContext>();
function embedWorkersPlugin({
	isWatch,
}: {
	isWatch: boolean;
}): Exclude<Options["esbuildPlugins"], undefined>[0] {
	return {
		name: "embed-workers",
		setup(build) {
			const namespace = "embed-worker";
			build.onResolve({ filter: /^worker:/ }, async (args) => {
				const name = args.path.substring("worker:".length);
				// Use `build.resolve()` API so Workers can be written as `m?[jt]s` files
				const result = await build.resolve("./" + name, {
					kind: "import-statement",
					resolveDir: TEMPLATES_DIR,
				});
				if (result.errors.length > 0) {
					return { errors: result.errors };
				}
				return { path: result.path, namespace };
			});
			build.onLoad({ filter: /.*/, namespace }, async (args) => {
				const ctx =
					workersContexts.get(args.path) ??
					(await esbuild.context({
						platform: "node", // Marks `node:*` imports as external
						format: "esm",
						target: "esnext",
						bundle: true,
						sourcemap: process.env.SOURCEMAPS !== "false",
						sourcesContent: false,
						metafile: true,
						external: ["cloudflare:email", "cloudflare:workers"],
						entryPoints: [args.path],
						outdir: build.initialOptions.outdir,
					}));
				const result = await ctx.rebuild();
				workersContexts.set(args.path, ctx);
				const watchFiles = Object.keys(result?.metafile?.inputs ?? {});
				const scriptPath = Object.keys(result?.metafile?.outputs ?? {}).find(
					(filepath) => filepath.endsWith(".js")
				);

				const contents = `
				import path from "node:path";
				const scriptPath = path.resolve(__dirname, "..", "${scriptPath}");
				export default scriptPath;
						`;

				return { contents, loader: "js", watchFiles };
			});

			// If we don't dispose the contexts, they will keep running and block the build from exiting.
			// But we must not dispose them in watch mode, as that would break the incremental builds.
			if (!isWatch) {
				build.onDispose(async () => {
					for (const ctx of workersContexts.values()) {
						await ctx.dispose();
					}
				});
			}
		},
	};
}

export default defineConfig((options) => [
	{
		keepNames: true,
		entry: ["src/cli.ts"],
		platform: "node",
		format: "cjs",
		dts: true,
		outDir: "wrangler-dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		external: EXTERNAL_DEPENDENCIES,
		sourcemap: process.env.SOURCEMAPS !== "false",
		inject: [path.join(__dirname, "import_meta_url.js")],
		// mainFields: ["module", "main"],
		define: {
			__RELATIVE_PACKAGE_PATH__: '".."',
			"import.meta.url": "import_meta_url",
			"process.env.NODE_ENV": `'${process.env.NODE_ENV || "production"}'`,
			"process.env.SPARROW_SOURCE_KEY": JSON.stringify(
				process.env.SPARROW_SOURCE_KEY ?? ""
			),
			...(process.env.ALGOLIA_APP_ID
				? { ALGOLIA_APP_ID: `"${process.env.ALGOLIA_APP_ID}"` }
				: {}),
			...(process.env.ALGOLIA_PUBLIC_KEY
				? { ALGOLIA_PUBLIC_KEY: `"${process.env.ALGOLIA_PUBLIC_KEY}"` }
				: {}),
			...(process.env.SENTRY_DSN
				? { SENTRY_DSN: `"${process.env.SENTRY_DSN}"` }
				: {}),
			...(process.env.WRANGLER_PRERELEASE_LABEL
				? {
						WRANGLER_PRERELEASE_LABEL: `"${process.env.WRANGLER_PRERELEASE_LABEL}"`,
					}
				: {}),
		},
		esbuildPlugins: [embedWorkersPlugin({ isWatch: !!options.watch })],
	},
]);
