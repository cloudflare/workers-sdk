import { defineConfig } from "tsup";

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
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
		],
	},
]);
