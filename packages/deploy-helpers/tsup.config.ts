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
		},
		platform: "node",
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		sourcemap: process.env.SOURCEMAPS !== "false",
		noExternal: [
			"@cloudflare/config",
			"@cloudflare/containers-shared",
			/^@cloudflare\/workers-shared(\/.*)?$/,
		],
		external: [
			/^@cloudflare\//,
			"blake3-wasm",
			"miniflare",
			"p-queue",
			"pretty-bytes",
			"undici",
			"chalk",
			"dotenv",
			"command-exists",
			"esbuild",
			// Keep zod external so wrangler (the only consumer) bundles a single
			// shared copy rather than inlining one here.
			/^zod(\/.*)?$/,
		],
	},
]);
