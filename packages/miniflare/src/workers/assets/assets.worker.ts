// Re-export the asset-worker entrypoints so ctx.exports loopback bindings are
// preserved in the bundled worker template.
export {
	default,
	AssetWorkerInner,
	AssetWorkerOuter,
} from "@cloudflare/workers-shared/asset-worker";
