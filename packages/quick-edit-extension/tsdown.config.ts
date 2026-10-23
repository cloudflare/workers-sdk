import assert from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "tsdown";

const workersTypes = path.resolve(
	import.meta.dirname,
	"node_modules/@cloudflare/workers-types/experimental/index.d.ts"
);

export default defineConfig({
	entry: { extension: "src/extension.ts" },
	format: "cjs",
	platform: "browser",
	fixedExtension: false,
	dts: false,
	deps: { neverBundle: ["vscode"] },
	plugins: [
		{
			name: "workers-types",
			resolveId(id) {
				if (id.startsWith("raw:")) {
					return "\0workers-types";
				}
			},
			async load(id) {
				if (id !== "\0workers-types") {
					return;
				}
				this.addWatchFile(workersTypes);
				const contents = await readFile(workersTypes, "utf8");
				// The .ts entry exports declarations; the editor needs ambient globals.
				assert(!/export declare/.test(contents));
				return `export default ${JSON.stringify(contents)};`;
			},
		},
	],
});
