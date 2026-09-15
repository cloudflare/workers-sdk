import path from "node:path";
import { defineConfig } from "tsdown";
import { embedWorkersPlugin } from "./scripts/embed-workers.ts";

export default defineConfig({
	entry: {
		index: "src/index.ts",
	},
	platform: "node",
	outDir: "dist",
	dts: true,
	tsconfig: "tsconfig.json",
	external: (id) => {
		const unprefixedId = id.charCodeAt(0) === 0 ? id.slice(1) : id;
		return (
			!unprefixedId.startsWith("worker:") &&
			!unprefixedId.startsWith(".") &&
			!path.isAbsolute(unprefixedId)
		);
	},
	plugins: [embedWorkersPlugin()],
});
