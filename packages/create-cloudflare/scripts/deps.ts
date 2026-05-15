/**
 * Dependencies that _are not_ bundled along with create-cloudflare.
 *
 * create-cloudflare bundles all of its dependencies into a single CJS file,
 * so this list is currently empty.
 */
export const EXTERNAL_DEPENDENCIES: string[] = [];

/**
 * Bare-specifier imports that legitimately appear in create-cloudflare's
 * bundled output but should NOT be treated as missing runtime dependencies.
 */
export const IGNORED_DIST_IMPORTS = [
	// `recast` (a bundled devDependency) attempts `require("babylon")` inside
	// a try/catch as a fallback parser when `@babel/parser` is not available.
	// We don't need to ship `babylon` because the primary `@babel/parser`
	// path is bundled and always succeeds.
	"babylon",
];
