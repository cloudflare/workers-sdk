// Populates Cloudflare.Exports (the type of ctx.exports) with loopback
// bindings derived from the main module's exports.
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./src/worker");
	}
}

// Adds `version` from the experimental `enable_version_api` compat flag.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- generic must match the original declaration for interface merging
interface ExecutionContext<Props = unknown> {
	readonly version?: {
		cohort?: string;
		key?: string;
		override?: string;
	};
}
