import worker from "@cloudflare/workers-shared/router-worker/src/index";

// Simply re-export the whole of the router-worker so that it gets compiled into the Miniflare code base.
// This allows us to have it as a devDependency only.
export default worker;
