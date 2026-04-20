import { defineConfig } from "tsup";

export default defineConfig(() => [
	{
		clean: true,
		entry: ["src/index.ts", "src/cli.ts"],
		platform: "node",
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.build.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
	},
]);
