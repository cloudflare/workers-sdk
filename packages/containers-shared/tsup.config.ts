import { defineConfig } from "tsup";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps";

export default defineConfig(() => [
	{
		clean: true,
		treeshake: true,
		keepNames: true,
		entry: {
			index: "index.ts",
		},
		platform: "node",
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		sourcemap: process.env.SOURCEMAPS !== "false",
		external: [/^@cloudflare\//, ...EXTERNAL_DEPENDENCIES],
	},
]);
