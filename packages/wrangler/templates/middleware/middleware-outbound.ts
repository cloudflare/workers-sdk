import type { Middleware } from "./common";

const HEADER_OUTBOUND_URL = "X-Miniflare-Dispatch-Outbound-URL";
const HEADER_PARAMETERS = "X-Miniflare-Dispatch-Outbound-Parameters";
const HEADER_CF_BLOB = "X-Miniflare-Dispatch-Cf-Blob";

// A middleware has to be a function of type Middleware
const outbound: Middleware = async (request, env, _ctx, middlewareCtx) => {
	const url = request.headers.get(HEADER_OUTBOUND_URL);
	if (!url) {
		return middlewareCtx.next(request, env);
	}
	const cfString = request.headers.get(HEADER_CF_BLOB);
	if (!cfString) {
		throw new Error(`Missing ${HEADER_CF_BLOB} header`);
	}
	const cf = JSON.parse(cfString);

	const parametersString = request.headers.get(HEADER_PARAMETERS);
	const parameters = parametersString ? JSON.parse(parametersString) : {};

	for (const [key, value] of Object.entries(parameters)) {
		env[key] = value;
	}

	request = new Request(url, { ...request, cf, method: request.method, headers: request.headers });

	request.headers.delete(HEADER_OUTBOUND_URL);
	request.headers.delete(HEADER_CF_BLOB);
	request.headers.delete(HEADER_PARAMETERS);

	return middlewareCtx.next(request, env);
};

export default outbound;
