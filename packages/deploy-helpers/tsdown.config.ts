import { defineConfig } from "tsdown";

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
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		shims: true,
		format: "esm",
		dts: true,
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
]);
