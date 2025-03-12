import type { Middleware } from "./common";

const assetsFetch: Middleware = async (request, env, _ctx, middlewareCtx) => {
	console.log("ASSETS", env.ASSETS?.fetch);
	// TODO: Use the asset binding name
	if (env.ASSETS && (await env.ASSETS.unstable_canFetch(request))) {
		return env.ASSETS.fetch(request);
	}
	return middlewareCtx.next(request, env);
};

export default assetsFetch;
