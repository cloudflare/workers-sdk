import { defineConfig } from "tsup";

// Recreates the CommonJS globals (`require`, `__filename`, `__dirname`) that
// esbuild otherwise leaves undefined in ESM output when it inlines CJS
// dependencies (e.g. `@ewoudenberg/difflib`, `json-diff`). Without this the
// output throws "Dynamic require of ... is not supported" / "__filename is not
// defined" in a pure-ESM context (e.g. when this package is imported by the
// Vite plugin at dev-server startup). Each initializer is self-contained so
// that, if tree-shaking drops an unused binding, the leftover side-effect
// expression can never reference a dropped variable.
const CJS_SHIM_BANNER = [
	'import { createRequire as __wsdkCreateRequire } from "node:module";',
	'import { fileURLToPath as __wsdkFileURLToPath } from "node:url";',
	'import { dirname as __wsdkDirname } from "node:path";',
	"var require = __wsdkCreateRequire(import.meta.url);",
	"var __filename = __wsdkFileURLToPath(import.meta.url);",
	"var __dirname = __wsdkDirname(__wsdkFileURLToPath(import.meta.url));",
].join("\n");

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		// Two entry points share context.ts as a singleton. esbuild's default
		// `splitting: true` dedupes it into a shared chunk. If splitting is
		// disabled, each entry bundles its own copy and init (via one entry)
		// won't populate globals read via the other. Keep splitting enabled.
		entry: {
			index: "src/index.ts",
			context: "src/shared/context.ts",
		},
		platform: "node",
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		sourcemap: process.env.SOURCEMAPS !== "false",
		banner: { js: CJS_SHIM_BANNER },
		noExternal: [
			"@cloudflare/config",
			"@cloudflare/containers-shared",
			/^@cloudflare\/workers-shared(\/.*)?$/,
		],
		external: [
			/^@cloudflare\//,
			"blake3-wasm",
			"miniflare",
			"p-queue",
			"pretty-bytes",
			"undici",
			"chalk",
			"dotenv",
			"command-exists",
			"esbuild",
			// Keep zod external so wrangler (the only consumer) bundles a single
			// shared copy rather than inlining one here.
			/^zod(\/.*)?$/,
		],
	},
]);
