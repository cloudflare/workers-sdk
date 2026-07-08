import { buildSync } from "esbuild";
import { defineConfig } from "tsdown";
import type { Plugin } from "rolldown";

/**
 * The embedded worker scripts this package ships. Each is bundled at build time
 * into a string literal and exposed via `import script from "virtual:<id>"`, so
 * there is no `readFileSync` at runtime — the scripts survive being bundled
 * inline by downstream consumers (wrangler, the Vite plugin).
 */
const EMBEDDED_WORKERS: Record<string, { entry: string; external: string[] }> =
	{
		// The worker uploaded to the edge (minimal mode) that dispatches proxied
		// requests to the real remote bindings.
		"virtual:proxy-server-worker": {
			entry: "templates/ProxyServerWorker.ts",
			external: ["cloudflare:email", "cloudflare:workers"],
		},
	};

function embeddedWorkersPlugin(): Plugin {
	return {
		name: "embedded-workers",
		resolveId(id) {
			if (id in EMBEDDED_WORKERS) {
				return `\0${id}`;
			}
		},
		load(id) {
			if (!id.startsWith("\0")) {
				return;
			}
			const spec = EMBEDDED_WORKERS[id.slice(1)];
			if (!spec) {
				return;
			}
			const result = buildSync({
				entryPoints: [spec.entry],
				bundle: true,
				format: "esm",
				write: false,
				external: spec.external,
				minify: false,
			});
			const code = result.outputFiles[0]?.text;
			if (!code) {
				throw new Error(`Failed to bundle embedded worker ${spec.entry}`);
			}
			return `export default ${JSON.stringify(code)};`;
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
	plugins: [embeddedWorkersPlugin()],
});
