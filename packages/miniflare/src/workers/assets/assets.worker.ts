// @ts-ignore the fact that there are no typings for this module
import worker from "@cloudflare/workers-shared/dist/asset-worker.mjs";

// Simply re-export the whole of the asset-worker so that it gets compiled into the Miniflare code base.
// This allows us to have it as a devDependency only.
export default worker;
