import { buildSync } from "esbuild";
import { defineConfig } from "tsdown";
import type { Plugin } from "rolldown";

const VIRTUAL_ID = "virtual:proxy-server-worker";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Rolldown plugin that bundles templates/ProxyServerWorker.ts at build time
 * and exposes the result as a string via `import script from "virtual:proxy-server-worker"`.
 *
 * This means the proxy worker script is a string literal in the output —
 * no readFileSync at runtime, so it works when wrangler bundles this package inline.
 */
function proxyServerWorkerPlugin(): Plugin {
	return {
		name: "proxy-server-worker",
		resolveId(id) {
			if (id === VIRTUAL_ID) {
				return RESOLVED_ID;
			}
		},
		load(id) {
			if (id === RESOLVED_ID) {
				const result = buildSync({
					entryPoints: ["templates/ProxyServerWorker.ts"],
					bundle: true,
					format: "esm",
					write: false,
					external: ["cloudflare:email", "cloudflare:workers"],
					minify: false,
				});

				const code = result.outputFiles[0]?.text;
				if (!code) {
					throw new Error("Failed to bundle ProxyServerWorker template");
				}

				return `export default ${JSON.stringify(code)};`;
			}
		},
	};
}

export default defineConfig({
	entry: ["src/index.ts"],
	platform: "node",
	// ESM-only: this package's `@cloudflare/*` dependencies are ESM-only (no
	// `require` export), so a CJS build would fail to load them. Consumers
	// (wrangler, the Vite plugin) bundle this package, so ESM is sufficient.
	format: ["esm"],
	outDir: "dist",
	dts: true,
	// Keep these external so downstream consumers (wrangler, the Vite plugin)
	// share a single copy rather than bundling duplicates. `undici` in
	// particular must be deduplicated for cross-boundary `instanceof` checks.
	external: ["miniflare", "undici", /^@cloudflare\//],
	plugins: [proxyServerWorkerPlugin()],
});
