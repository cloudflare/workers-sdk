// Re-export the asset-worker so that its contents gets compiled into the Miniflare code base as a Worker template.
// AssetWorkerInner must be explicitly re-exported so that the bundled module exposes it
// via ctx.exports (enabled by the enable_ctx_exports compat flag). Without this,
// esbuild tree-shakes AssetWorkerInner and the outer→inner loopback dispatch fails.
export {
	default,
	AssetWorkerInner,
} from "@cloudflare/workers-shared/asset-worker";
