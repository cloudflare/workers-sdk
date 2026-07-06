import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/test-helpers/index.ts"],
	platform: "node",
	format: ["esm"],
	dts: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	sourcemap: process.env.SOURCEMAPS !== "false",
	define: {
		"process.env.NODE_ENV": `'${"production"}'`,
	},
	// Enable `__dirname`/`__filename` shims so inlined CommonJS dependencies
	// (which reference `__filename` via `createRequire`) work in the ESM
	// output. The `require` shim is auto-injected for node ESM output. All
	// shims are tree-shaken when unused.
	shims: true,
	// Rely on tsdown defaults for `@cloudflare/*`: `@cloudflare/workers-utils` is
	// a runtime dependency with proper `exports`, so it is externalized by
	// default. `vitest`/`msw` are devDependencies used by the `test-helpers`
	// entry, so keep them external; `undici` is already external as a runtime
	// dependency.
	external: ["vitest", "undici", "msw"],
});
