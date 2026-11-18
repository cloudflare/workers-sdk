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

	// ws optionally loads bufferutil inside try/catch for native masking;
	// otherwise it retains its JavaScript implementation.
	"bufferutil",
	// ws prefers Node's buffer.isUtf8. Its older-Node native fallback is guarded
	// by try/catch and retains a JavaScript implementation if unavailable.
	"utf-8-validate",

	// @webcontainer/env probes @blitz/internal/env inside try/catch. Its absence
	// makes isWebContainer() return false and leaves normal URLs unchanged.
	"@blitz/internal",

	// recast tries babylon only if loading @babel/parser throws. The primary
	// parser is bundled with Wrangler, so this legacy fallback is unnecessary.
	"babylon",
];
