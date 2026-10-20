import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";

export default defineConfig([
	{
		// Build all entry points together so they share the same context singleton.
		entry: {
			index: "src/index.ts",
			context: "src/shared/context.ts",
			"create-worker-upload-form":
				"src/deploy/helpers/create-worker-upload-form.ts",
			"startup-profile": "src/startup-profile.ts",
		},
		platform: "node",
		outputOptions: { keepNames: true },
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		shims: true,
		format: "esm",
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		deps: {
			alwaysBundle: [/^@cloudflare\/workers-shared(\/.*)?$/],
			neverBundle: [
				"miniflare",
				"p-queue",
				"pretty-bytes",
				"undici",
				"chalk",
				"dotenv",
				"command-exists",
				"esbuild",
				"ws",
			],
		},
	},
	{
		entry: {
			index: "emitted-types/packages/deploy-helpers/src/index.d.ts",
			context: "emitted-types/packages/deploy-helpers/src/shared/context.d.ts",
			"create-worker-upload-form":
				"emitted-types/packages/deploy-helpers/src/deploy/helpers/create-worker-upload-form.d.ts",
			"startup-profile":
				"emitted-types/packages/deploy-helpers/src/startup-profile.d.ts",
		},
		platform: "node",
		format: "esm",
		outDir: "dist",
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
		tsconfig: "tsconfig.bundle.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		plugins: [emitDeclarations()],
		deps: {
			neverBundle: [
				/^@cloudflare\/(?!workers-shared(?:\/|$))/,
				"blake3-wasm",
				"miniflare",
				"p-queue",
				"pretty-bytes",
				"undici",
				"chalk",
				"dotenv",
				"command-exists",
				"esbuild",
				"ws",
			],
		},
	},
]);
