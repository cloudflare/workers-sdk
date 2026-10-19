import path from "node:path";
import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
	},
	platform: "node",
	outDir: "dist",
	dts: true,
	tsconfig: "tsconfig.json",
	// Consumers bundle this package, so leave every bare import for them to resolve.
	external: (id) => !id.startsWith(".") && !path.isAbsolute(id),
});
