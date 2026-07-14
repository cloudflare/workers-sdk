import { defineConfig } from "tsdown";

export default defineConfig({
	// Two entry points share context.ts as a singleton. tsdown always
	// code-splits, so context.ts is deduped into a shared chunk and its
	// globals are populated once regardless of which entry initialises it.
	entry: {
		index: "src/index.ts",
		context: "src/shared/context.ts",
	},
	platform: "node",
	format: ["esm"],
	dts: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	sourcemap: process.env.SOURCEMAPS !== "false",
	// Enable `__dirname`/`__filename` shims so inlined CommonJS dependencies
	// (e.g. `@ewoudenberg/difflib` via `json-diff`) work in the ESM output. The
	// `require` shim is auto-injected for node ESM output. All shims are
	// tree-shaken when unused.
	shims: true,
	// tsdown externalises `dependencies` and bundles used `devDependencies` by
	// default, which matches how this package ships: the workspace
	// `@cloudflare/config`, `@cloudflare/containers-shared` and
	// `@cloudflare/workers-shared` (all devDependencies) are inlined, while
	// runtime deps stay external. `zod` is the exception — it is pulled in
	// transitively through the bundled `@cloudflare/config`, but must stay
	// external so wrangler (the consumer) bundles a single shared copy rather
	// than inlining one here.
	external: [/^zod(\/.*)?$/],
});
