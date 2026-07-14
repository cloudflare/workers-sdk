import path from "node:path";
import { build } from "esbuild";
import { defineConfig } from "tsdown";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";
import type { Plugin } from "rolldown";

const templatesDir = path.resolve(import.meta.dirname, "templates");

const embedWorkersPlugin: Plugin = {
	name: "embed-workers",
	resolveId(source) {
		if (source.startsWith("worker:")) {
			return `\0${source}`;
		}
	},
	async load(id) {
		if (!id.startsWith("\0worker:")) {
			return;
		}
		const entry = path.resolve(templatesDir, id.slice("\0worker:".length));
		this.addWatchFile(entry);
		const result = await build({
			entryPoints: [entry],
			bundle: true,
			write: false,
			format: "esm",
			platform: "node",
			target: "esnext",
			conditions: ["workerd", "worker", "browser"],
			external: ["cloudflare:email", "cloudflare:workers"],
		});
		const output = result.outputFiles[0];
		if (!output) {
			throw new Error(`Failed to build embedded Worker ${entry}`);
		}
		return `export default ${JSON.stringify(output.text)};`;
	},
};

export default defineConfig({
	entry: {
		index: "src/index.ts",
		"internal/proxy-worker": "src/proxy-worker.ts",
		"preview/create-worker-preview": "src/preview/create-worker-preview.ts",
	},
	platform: "node",
	outDir: "dist",
	dts: true,
	tsconfig: "tsconfig.json",
	external: EXTERNAL_DEPENDENCIES,
	noExternal: [
		/^@cloudflare\/deploy-helpers(\/.*)?$/,
		/^@cloudflare\/workers-utils(\/.*)?$/,
	],
	plugins: [embedWorkersPlugin],
});
