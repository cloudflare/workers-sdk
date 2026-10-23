import path from "node:path";
import { defineConfig } from "tsdown";
import { bundleWorker } from "../../tools/build/bundle-worker.mjs";
import { emitDeclarations } from "../../tools/build/declarations.mjs";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";

const TEMPLATES_DIR = path.join(import.meta.dirname, "templates");
const MONOREPO_PACKAGE_ALIASES = {
	"@cloudflare/autoconfig": path.join(
		import.meta.dirname,
		"../autoconfig/src/index.ts"
	),
	"@cloudflare/deploy-helpers/context": path.join(
		import.meta.dirname,
		"../deploy-helpers/src/shared/context.ts"
	),
	"@cloudflare/deploy-helpers/create-worker-upload-form": path.join(
		import.meta.dirname,
		"../deploy-helpers/src/deploy/helpers/create-worker-upload-form.ts"
	),
	"@cloudflare/deploy-helpers/startup-profile": path.join(
		import.meta.dirname,
		"../deploy-helpers/src/startup-profile.ts"
	),
	"@cloudflare/deploy-helpers": path.join(
		import.meta.dirname,
		"../deploy-helpers/src/index.ts"
	),
	"@cloudflare/pages-functions": path.join(
		import.meta.dirname,
		"../pages-functions/src/index.ts"
	),
	"@cloudflare/runtime-types": path.join(
		import.meta.dirname,
		"../runtime-types/src/index.ts"
	),
	"@cloudflare/workers-utils": path.join(
		import.meta.dirname,
		"../workers-utils/src"
	),
};

/** Bundle embedded templates and register their dependencies with the watcher. */
function embedWorkersPlugin() {
	return {
		name: "embed-workers",
		async resolveId(
			this: {
				resolve: (
					id: string,
					importer?: string
				) => Promise<{ id: string } | null>;
			},
			id: string
		) {
			if (!id.startsWith("worker:")) {
				return;
			}
			const entry = await this.resolve(
				path.join(TEMPLATES_DIR, id.slice("worker:".length))
			);
			if (entry === null) {
				throw new Error(`Unable to resolve embedded Worker ${id}`);
			}
			return `\0worker:${entry.id}`;
		},
		async load(this: { addWatchFile: (id: string) => void }, id: string) {
			if (!id.startsWith("\0worker:")) {
				return;
			}
			const entry = id.slice("\0worker:".length);
			const relative = path
				.relative(TEMPLATES_DIR, entry)
				.replace(/\.[cm]?[jt]s$/, ".js");
			const outputFile = path.join(
				import.meta.dirname,
				"wrangler-dist/workers",
				relative
			);
			const { watchFiles } = await bundleWorker(
				{ input: entry },
				{
					file: outputFile,
					sourcemap: process.env.SOURCEMAPS !== "false",
					sourcemapExcludeSources: true,
				}
			);
			for (const file of watchFiles) {
				this.addWatchFile(file);
			}
			return `import path from "node:path"; export default path.join(__dirname, "workers", ${JSON.stringify(relative)});`;
		},
	};
}
export default defineConfig([
	{
		treeshake: true,
		outputOptions: { keepNames: true, codeSplitting: false },
		entry: ["src/cli.ts"],
		platform: "node",
		format: "cjs",
		outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
		clean: false,
		dts: false,
		outDir: "wrangler-dist",
		tsconfig: "tsconfig.json",
		deps: {
			neverBundle: EXTERNAL_DEPENDENCIES,
		},
		sourcemap: process.env.SOURCEMAPS !== "false",
		alias: MONOREPO_PACKAGE_ALIASES,
		inputOptions: (options) => ({
			...options,
			resolve: { ...options.resolve, mainFields: ["module", "main"] },
			transform: {
				...options.transform,
				inject: {
					...options.transform?.inject,
					import_meta_url: [
						path.join(import.meta.dirname, "import_meta_url.js"),
						"import_meta_url",
					],
				},
			},
		}),
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
		plugins: [embedWorkersPlugin()],
	},
	{
		entry: { "experimental-config": "src/experimental-config.ts" },
		platform: "node",
		outDir: "wrangler-dist",
		clean: false,
		tsconfig: "tsconfig.experimental-config.json",
		dts: false,
	},
	{
		entry: {
			cli: "emitted-types/packages/wrangler/src/cli.d.ts",
		},
		platform: "node",
		format: "esm",
		outDir: "wrangler-dist",
		clean: false,
		dts: {
			dtsInput: true,
			emitDtsOnly: true,
			sourcemap: process.env.SOURCEMAPS !== "false",
		},
		outputOptions: {
			entryFileNames: "[name].d.ts",
			chunkFileNames: "[name]-[hash].d.ts",
		},
		tsconfig: "tsconfig.bundle.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		outExtensions: () => ({ dts: ".d.ts" }),
		plugins: [emitDeclarations()],
		deps: {
			neverBundle: true,
			alwaysBundle: ["@cloudflare/workflows-shared/src/types"],
		},
	},
	{
		entry: {
			"experimental-config":
				"emitted-types/experimental/packages/wrangler/src/experimental-config.d.ts",
		},
		platform: "node",
		format: "esm",
		outDir: "wrangler-dist",
		clean: false,
		dts: {
			dtsInput: true,
			emitDtsOnly: true,
			sourcemap: process.env.SOURCEMAPS !== "false",
		},
		outputOptions: {
			entryFileNames: "[name].d.mts",
			chunkFileNames: "[name]-[hash].d.mts",
		},
		tsconfig: "tsconfig.bundle.experimental.json",
		plugins: [emitDeclarations("tsconfig.declarations.experimental.json")],
		deps: { alwaysBundle: ["@cloudflare/config"] },
	},
]);
