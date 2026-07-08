import { buildSync } from "esbuild";
import { defineConfig } from "tsdown";
import type { Plugin } from "rolldown";

const VIRTUAL_ID = "virtual:proxy-worker";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Bundles `templates/ProxyWorker.ts` at build time into a string literal
 * exposed via `import script from "virtual:proxy-worker"`. Both consumers
 * (wrangler's ProxyController and @cloudflare/remote-bindings) pass this string
 * straight to Miniflare as inline module `contents`, so there is a single
 * bundled copy of the proxy worker and no `readFileSync` at runtime.
 *
 * The esbuild settings mirror wrangler's `embedWorkersPlugin` (workerd
 * conditions, `node:*` left external for `nodejs_compat`, `cloudflare:*`
 * external) so the produced script is byte-for-byte the worker wrangler ships.
 */
function proxyWorkerPlugin(): Plugin {
	return {
		name: "proxy-worker",
		resolveId(id) {
			if (id === VIRTUAL_ID) {
				return RESOLVED_ID;
			}
		},
		load(id) {
			if (id !== RESOLVED_ID) {
				return;
			}
			const result = buildSync({
				entryPoints: ["templates/ProxyWorker.ts"],
				bundle: true,
				format: "esm",
				platform: "node",
				conditions: ["workerd", "worker", "browser"],
				target: "esnext",
				write: false,
				external: ["cloudflare:email", "cloudflare:workers"],
				minify: false,
			});
			const code = result.outputFiles[0]?.text;
			if (!code) {
				throw new Error("Failed to bundle ProxyWorker template");
			}
			return `export default ${JSON.stringify(code)};`;
		},
	};
}

export default defineConfig({
	entry: ["src/index.ts"],
	platform: "node",
	format: ["esm"],
	outDir: "dist",
	dts: true,
	external: ["miniflare"],
	plugins: [proxyWorkerPlugin()],
});
