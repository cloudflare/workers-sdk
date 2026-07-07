import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { defineConfig } from "tsdown";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";
import type { UserConfig } from "tsdown";

// The rolldown `Plugin` type, derived from tsdown's config so we don't need a
// direct dependency on `rolldown`.
type Plugin = Extract<NonNullable<UserConfig["plugins"]>, { name: string }>;

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(rootDir, "templates");
const OUT_DIR = "wrangler-dist";

// Virtual-module marker for resolved `worker:` imports.
const WORKER_NAMESPACE = "\0worker:";

/**
 * Rolldown port of the esbuild `embed-workers` plugin.
 *
 * `import ... from "worker:<name>"` imports are resolved against the
 * `templates/` directory and bundled as standalone ESM worker scripts (for
 * workerd) via a nested esbuild build. The original import is replaced with a
 * module that resolves the bundled script's path on disk at runtime, so the
 * published wrangler bundle ships pre-built worker scripts.
 */
function embedWorkersPlugin({ isWatch }: { isWatch: boolean }): Plugin {
	const workersContexts = new Map<string, esbuild.BuildContext>();
	return {
		name: "embed-workers",
		async resolveId(source) {
			if (!source.startsWith("worker:")) {
				return null;
			}
			const name = source.substring("worker:".length);
			// Resolve relative to the templates dir so workers can be authored as
			// `m?[jt]s` files.
			const resolved = await this.resolve(
				"./" + name,
				path.join(TEMPLATES_DIR, "index.ts")
			);
			if (!resolved) {
				return null;
			}
			return WORKER_NAMESPACE + resolved.id;
		},
		async load(id) {
			if (!id.startsWith(WORKER_NAMESPACE)) {
				return null;
			}
			const entryPoint = id.substring(WORKER_NAMESPACE.length);
			const ctx =
				workersContexts.get(entryPoint) ??
				(await esbuild.context({
					platform: "node", // Marks `node:*` imports as external
					conditions: ["workerd", "worker", "browser"],
					format: "esm",
					target: "esnext",
					bundle: true,
					sourcemap: process.env.SOURCEMAPS !== "false",
					sourcesContent: false,
					metafile: true,
					external: ["cloudflare:email", "cloudflare:workers"],
					entryPoints: [entryPoint],
					outdir: path.join(rootDir, OUT_DIR),
				}));
			const result = await ctx.rebuild();
			workersContexts.set(entryPoint, ctx);
			const watchFiles = Object.keys(result?.metafile?.inputs ?? {});
			const scriptPath = Object.keys(result?.metafile?.outputs ?? {}).find(
				(filepath) => filepath.endsWith(".js")
			);
			for (const watchFile of watchFiles) {
				this.addWatchFile(watchFile);
			}

			return `
				import path from "node:path";
				const scriptPath = path.resolve(__dirname, "..", ${JSON.stringify(scriptPath)});
				export default scriptPath;
			`;
		},
		async closeBundle() {
			// If we don't dispose the contexts, they will keep running and block the
			// build from exiting. But we must not dispose them in watch mode, as
			// that would break the incremental builds.
			if (!isWatch) {
				for (const ctx of workersContexts.values()) {
					await ctx.dispose();
				}
				workersContexts.clear();
			}
		},
	};
}

const optionalDefines: Record<string, string> = {
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
};

export default defineConfig((options): UserConfig[] => [
	{
		entry: { cli: "src/cli.ts" },
		platform: "node",
		format: ["cjs"],
		outDir: OUT_DIR,
		tsconfig: "tsconfig.json",
		dts: {
			resolve: ["@cloudflare/workflows-shared/src/types"],
		},
		// wrangler's published entry points expect `cli.js` / `cli.d.ts`, not
		// tsdown's default `.cjs` / `.d.cts` for the CommonJS format.
		outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
		external: EXTERNAL_DEPENDENCIES,
		sourcemap: process.env.SOURCEMAPS !== "false",
		// Down-level `import.meta.url` (used by bundled ESM dependencies such as
		// `@cloudflare/workers-utils`) to a working value in the CommonJS bundle.
		shims: true,
		define: {
			__RELATIVE_PACKAGE_PATH__: '".."',
			"process.env.NODE_ENV": `'${process.env.NODE_ENV || "production"}'`,
			"process.env.SPARROW_SOURCE_KEY": JSON.stringify(
				process.env.SPARROW_SOURCE_KEY ?? ""
			),
			...optionalDefines,
		},
		plugins: [embedWorkersPlugin({ isWatch: !!options.watch })],
		outputOptions: {
			// Emit a single `cli.js` bundle (inlining dynamic imports) to match the
			// previous tsup output, rather than splitting into many chunks.
			inlineDynamicImports: true,
		},
		inputOptions: {
			onwarn(warning, defaultHandler) {
				// Suppress the warning for the intentional runtime dynamic `import()`
				// in `@cloudflare/config`'s `loadConfig` (packages/config/src/load.ts).
				// The import is unanalyzable by design: the specifier is computed at
				// runtime and the `with: { cf: "no-cache" }` attribute is consumed by a
				// Node `registerHooks` resolver.
				if (warning.code === "IMPORT_ATTRIBUTE") {
					return;
				}
				defaultHandler(warning);
			},
		},
	},
	{
		entry: {
			"experimental-config": "src/experimental-config.ts",
		},
		platform: "node",
		outDir: OUT_DIR,
		clean: false,
		tsconfig: "tsconfig.experimental-config.json",
		dts: {
			resolve: ["@cloudflare/config"],
		},
	},
]);
