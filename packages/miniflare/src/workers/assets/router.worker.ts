// Re-export the router-worker outer and inner entrypoints so ctx.exports loopback
// bindings are preserved in the bundled worker template.
export {
	default,
	RouterInnerEntrypoint,
} from "@cloudflare/workers-shared/router-worker";
