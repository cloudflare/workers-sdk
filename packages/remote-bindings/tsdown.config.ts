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
	external: [/^(?!(?:\0)?worker:)[^./]/],
	plugins: [embedWorkersPlugin()],
});
