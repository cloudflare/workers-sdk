import { defineConfig } from "tsup";

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		// Two entry points share context.ts as a singleton. esbuild's default
		// `splitting: true` dedupes it into a shared chunk. If splitting is
		// disabled, each entry bundles its own copy and init (via one entry)
		// won't populate globals read via the other. Keep splitting enabled.
		entry: {
			index: "src/index.ts",
			context: "src/shared/context.ts",
			"dev-vars": "src/dev/dev-vars.ts",
			"miniflare-options": "src/dev/miniflare-options.ts",
			"pages-assets": "src/dev/pages-assets.ts",
			"create-worker-upload-form":
				"src/deploy/helpers/create-worker-upload-form.ts",
			"startup-profile": "src/startup-profile.ts",
		},
		platform: "node",
		// Provide require for bundled CommonJS dependencies. The __filename
		// fallback keeps the output working when it is rebundled to CommonJS.
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url || (typeof __filename === "string" ? __filename : "/"));',
		},
		format: "esm",
		// `pages-assets.ts` can't be type-checked (see `pages-assets-types.ts`),
		// so its declarations come from a separate file.
		dts: {
			entry: {
				index: "src/index.ts",
				context: "src/shared/context.ts",
				"dev-vars": "src/dev/dev-vars.ts",
				"miniflare-options": "src/dev/miniflare-options.ts",
				"pages-assets": "src/dev/pages-assets-types.ts",
				"create-worker-upload-form":
					"src/deploy/helpers/create-worker-upload-form.ts",
				"startup-profile": "src/startup-profile.ts",
			},
		},
		outDir: "dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		sourcemap: process.env.SOURCEMAPS !== "false",
		noExternal: [/^@cloudflare\/(workers|pages)-shared(\/.*)?$/],
		external: [
			/^@cloudflare\//,
			"blake3-wasm",
			"miniflare",
			"p-queue",
			"pretty-bytes",
			"undici",
			"chalk",
			"chokidar",
			"dotenv",
			"dotenv-expand",
			"mime",
			"command-exists",
			"esbuild",
			"ws",
		],
	},
]);
