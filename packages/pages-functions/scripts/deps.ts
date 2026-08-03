/**
 * Dependencies that _are not_ bundled along with @cloudflare/pages-functions.
 *
 * These must be explicitly documented with a reason why they cannot be bundled.
 * This list is validated by `tools/deployments/validate-package-dependencies.ts`.
 */
export const EXTERNAL_DEPENDENCIES = [
	// esbuild ships platform-specific native binaries and must be resolved
	// from the consumer's node_modules at install time — not inlined into our
	// bundle. It is invoked at runtime to compile user function code and to
	// inspect exports via metafile.
	"esbuild",

	// path-to-regexp is used at runtime by the Pages Worker template to match
	// URL patterns. It must be resolvable from the consumer's node_modules so
	// the template can import it when esbuild compiles the final Worker bundle.
	"path-to-regexp",
];
