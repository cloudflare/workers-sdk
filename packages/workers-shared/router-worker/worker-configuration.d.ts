// Populates Cloudflare.Exports (the type of ctx.exports) with loopback
// bindings derived from the main module's exports.
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./src/worker");
	}
}
