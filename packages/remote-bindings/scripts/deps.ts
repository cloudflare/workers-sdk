/** Dependencies that are not bundled with @cloudflare/remote-bindings. */
export const EXTERNAL_DEPENDENCIES = [
	// Miniflare contains the workerd native runtime and its object identity must
	// be shared with consumers for classes, errors, and runtime state.
	"miniflare",
	// Keep a single undici instance so request classes and global dispatcher
	// configuration are shared with the consuming CLI.
	"undici",
];
