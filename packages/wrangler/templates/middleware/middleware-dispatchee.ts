import type { Middleware } from "./common";

const HEADER_OUTBOUND_URL = "X-Miniflare-Dispatch-Outbound-URL";
const HEADER_URL = "X-Miniflare-Dispatch-URL";
const HEADER_OUTBOUND_PROXY_URL = "X-Miniflare-Dispatch-Outbound-Proxy-URL";
const HEADER_PARAMETERS = "X-Miniflare-Dispatch-Outbound-Parameters";
const HEADER_CF_BLOB = "X-Miniflare-Dispatch-Cf-Blob";

// A middleware has to be a function of type Middleware
const dispatchee: Middleware = async (request, env, _ctx, middlewareCtx) => {
	const url = request.headers.get(HEADER_URL);
	if (!url) {
		throw new Error(
			`This Worker is configured to belong to a dispatch namespace and cannot be access directly. Instead, fetch it from a dispatch namespace binding.`
		);
	}
	const cfString = request.headers.get(HEADER_CF_BLOB);
	if (!cfString) {
		throw new Error(`Missing ${HEADER_CF_BLOB} header`);
	}
	const cf = JSON.parse(cfString);

	const outboundProxyUrl = request.headers.get(HEADER_OUTBOUND_PROXY_URL);
	const parameters = request.headers.get(HEADER_PARAMETERS);

	request = new Request(url, { ...request, cf, method: request.method, headers: request.headers });

	request.headers.delete(HEADER_URL);
	request.headers.delete(HEADER_OUTBOUND_PROXY_URL);
	request.headers.delete(HEADER_PARAMETERS);
	request.headers.delete(HEADER_CF_BLOB);

	if (outboundProxyUrl) {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (outboundRequestInit, outboundRequestInfo) => {
			const outboundRequest = new Request(
				outboundRequestInit,
				outboundRequestInfo
			);
			outboundRequest.headers.set(HEADER_OUTBOUND_URL, outboundRequest.url);
			outboundRequest.headers.set(HEADER_CF_BLOB, cfString); // cfString here, or outboundRequest.cf?
			if (parameters) {
				outboundRequest.headers.set(HEADER_PARAMETERS, parameters);
			}
			return originalFetch(outboundProxyUrl, outboundRequest);
		};
	}

	return middlewareCtx.next(request, env);
};

export default dispatchee;
