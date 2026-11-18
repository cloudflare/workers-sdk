/**
 * Dependencies that must be installed alongside Wrangler
 */
export const EXTERNAL_DEPENDENCIES = [
	// Public declarations must share workers-utils' unique symbol types. Its JS
	// stays bundled because Wrangler is CommonJS and workers-utils is ESM-only.
	"@cloudflare/workers-utils",

	// The public API exposes SDK and protocol types. Keep these packages installed
	// so consumers can resolve their declarations without bundling their namespaces.
	"cloudflare",
	"devtools-protocol",
	"@types/yargs",

	// Share Undici's Request/Response classes and global dispatcher with Miniflare.
	"undici",

	// The shared source-map helper reloads this module through the real require
	// cache to isolate stack-trace handlers, so it cannot be bundled.
	"@cspotcode/source-map-support",

	// Wrangler depends on a pinned version of esbuild.
	"esbuild",

	// Wrangler depends on a pinned version of Miniflare.
	"miniflare",

	// @cloudflare/workers-types is an optional peer dependency of wrangler, so users can
	// get the types by installing the package (to what version they prefer) themselves
	"@cloudflare/workers-types",

	// unenv must be external because it contains unenv/runtime code which needs to be resolved
	// and read when we are bundling the worker application
	"unenv",
	"@cloudflare/unenv-preset",

	// path-to-regexp must be external because it contains runtime code which needs to be resolved
	// and read when we are bundling the worker application.
	// See `templates/pages-template-workers`
	"path-to-regexp",

	// @cloudflare/kv-asset-handler must be external because it contains runtime code which needs to be resolved
	// and read when we are bundling the worker application
	// Pending deletion in v4...
	"@cloudflare/kv-asset-handler",

	// workerd contains a native binary, so must be external. Wrangler depends on a pinned version.
	"workerd",
];

/**
 * Bare-specifier imports that legitimately appear in wrangler's bundled
 * output but should NOT be treated as missing runtime dependencies.
 *
 * Each entry must be justified — typically the import is guarded
 * (try/catch, optional require) inside a bundled-in third-party library that
 * probes for the consumer's environment.
 */
export const IGNORED_DIST_IMPORTS = [
	// @netlify/build-info (bundled devDependency) tries to require these
	// framework packages to detect what the user has installed. Each call
	// is guarded by try/catch and used only for framework detection.
	"@angular/ssr",
	"@cloudflare/vite-plugin",
	"isbot",
	"react-dom",
	"react-router",
	"waku",

	// @aws-sdk/client-s3 (bundled devDependency) optionally uses this native
	// crypto implementation if installed; falls back to a JS implementation
	// when missing.
	"@aws-sdk/signature-v4-crt",

	// ws (bundled transitive dependency) optionally uses these native
	// acceleration modules if installed; each require is guarded by a
	// try/catch (and an env flag) and falls back to a JS implementation.
	"bufferutil",
	"utf-8-validate",

	// @blitz/internal/env is optionally required inside a try/catch by a
	// bundled dependency; the failure is swallowed when it is not installed.
	"@blitz/internal",

	// recast uses this legacy fallback only when @babel/parser is unavailable.
	// @babel/parser is bundled with Wrangler.
	"babylon",
];
