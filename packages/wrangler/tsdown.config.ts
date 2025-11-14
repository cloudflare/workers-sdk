import path from "node:path";
import * as esbuild from "esbuild";
import { defineConfig } from "tsdown";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.js";
import type { UserConfig } from "tsdown";

const TEMPLATES_DIR = path.join(__dirname, "templates");
const workersContexts = new Map<string, esbuild.BuildContext>();

function embedWorkersPlugin(): UserConfig["plugins"] {
	const WORKER_PREFIX = "worker:";
	const VIRTUAL_PREFIX = "\0embed-worker:";

	return {
		name: "embed-workers",

		async resolveId(source, importer, options) {
			if (source.startsWith(WORKER_PREFIX)) {
				const name = source.substring(WORKER_PREFIX.length);

				// Use this.resolve() API so Workers can be written as `m?[jt]s` files
				// Create a fake importer path within the templates directory for resolution
				const fakeImporter = path.join(
					TEMPLATES_DIR,
					"__virtual_importer__.js"
				);
				const result = await this.resolve("./" + name, fakeImporter, {
					skipSelf: true,
					...options,
				});

				if (!result) {
					this.error(`Failed to resolve worker: ${source}`);
					return null;
				}

				if (result.external) {
					this.error(
						`Worker resolved as external: ${source} (id: ${result.id})`
					);
					return null;
				}

				// Return virtual module ID with the resolved path
				return VIRTUAL_PREFIX + result.id;
			}
			return null;
		},

		async load(id) {
			if (!id.startsWith(VIRTUAL_PREFIX)) {
				return null;
			}

			const workerPath = id.substring(VIRTUAL_PREFIX.length);

			// Get or create esbuild context for this worker
			const ctx =
				workersContexts.get(workerPath) ??
				(await esbuild.context({
					platform: "node", // Marks `node:*` imports as external
					format: "esm",
					target: "esnext",
					bundle: true,
					sourcemap: process.env.SOURCEMAPS !== "false",
					sourcesContent: false,
					metafile: true,
					external: ["cloudflare:email", "cloudflare:workers"],
					entryPoints: [workerPath],
					outdir: "wrangler-dist",
				}));

			const result = await ctx.rebuild();
			workersContexts.set(workerPath, ctx);

			// Add all worker dependencies to watch list
			const watchFiles = Object.keys(result?.metafile?.inputs ?? {});
			for (const file of watchFiles) {
				this.addWatchFile(file);
			}

			const scriptPath = Object.keys(result?.metafile?.outputs ?? {}).find(
				(filepath) => filepath.endsWith(".js")
			);

			const contents = `
import path from "node:path";
const scriptPath = path.resolve(__dirname, "..", "${scriptPath}");
export default scriptPath;
			`;

			return { code: contents };
		},

		closeBundle() {
			// If we don't dispose the contexts, they will keep running and block the build from exiting.
			// But we must not dispose them in watch mode, as that would break the incremental builds.
			if (!this.meta.watchMode) {
				// Use Promise.all to dispose all contexts concurrently
				void Promise.all(
					Array.from(workersContexts.values()).map((ctx) => ctx.dispose())
				).then(() => {
					workersContexts.clear();
				});
			}
		},
	};
}

export default defineConfig((options) => [
	{
		treeshake: true,
		keepNames: true,
		entry: ["src/cli.ts"],
		platform: "node",
		format: "cjs",
		dts: {
			resolve: [
				"@cloudflare/workers-shared",
				"@cloudflare/containers-shared",
				"@cloudflare/workers-types/experimental",
			],
			compilerOptions: {
				// workaround for https://github.com/rolldown/tsdown/issues/345
				paths: {
					"@cloudflare/workers-shared": ["../workers-shared"],
					"@cloudflare/containers-shared": ["../containers-shared"],
				},
			},
		},
		outDir: "wrangler-dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		external: EXTERNAL_DEPENDENCIES,
		banner: {
			js: 'require("cloudflare/shims/web");',
		},
		sourcemap: process.env.SOURCEMAPS !== "false",
		fixedExtension: false,
		define: {
			__RELATIVE_PACKAGE_PATH__: '".."',
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
		plugins: [embedWorkersPlugin()],
	},
]);
