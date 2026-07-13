/** Dependencies that are not bundled with @cloudflare/remote-bindings. */
export const EXTERNAL_DEPENDENCIES = [
	// Deploy helpers owns native/WASM-aware upload dependencies such as
	// blake3-wasm, which cannot be safely inlined without their package assets.
	"@cloudflare/deploy-helpers",
	// Miniflare contains the workerd native runtime and its object identity must
	// be shared with consumers for classes, errors, and runtime state.
	"miniflare",
	// The internal DevEnv type surface preserves Chrome DevTools protocol types.
	// Keep the canonical protocol package external so declarations remain precise.
	"devtools-protocol",
	// Keep a single undici instance so request classes and global dispatcher
	// configuration are shared with the consuming CLI.
	"undici",
	// Has optional native bindings for performance; externalise it to preserve
	// the standard runtime resolution used by Wrangler, Vite, and Miniflare.
	"ws",
	// Runtime dependency of externalised @cloudflare/deploy-helpers; keep it
	// resolvable for installed consumers without bundling deploy-helpers.
	"zod",
];
