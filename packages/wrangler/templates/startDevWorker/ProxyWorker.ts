import {
	createDeferred,
	DeferredPromise,
	urlFromParts,
} from "../../src/api/startDevWorker/utils";
import type {
	ProxyData,
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
} from "../../src/api/startDevWorker/events";

interface Env {
	PROXY_CONTROLLER: Fetcher;
	PROXY_CONTROLLER_AUTH_SECRET: string;
	DURABLE_OBJECT: DurableObjectNamespace;
}

// request.cf.hostMetadata is verbose to type using the workers-types Request -- this allows us to have Request correctly typed in this scope
type Request = Parameters<
	NonNullable<
		ExportedHandler<Env, unknown, ProxyWorkerIncomingRequestBody>["fetch"]
	>
>[0];

const LIVE_RELOAD_PROTOCOL = "WRANGLER_PROXYWORKER_LIVE_RELOAD_PROTOCOL";
export default {
	fetch(req, env) {
		const singleton = env.DURABLE_OBJECT.idFromName("");
		const inspectorProxy = env.DURABLE_OBJECT.get(singleton);

		return inspectorProxy.fetch(req);
	},
} as ExportedHandler<Env, unknown, ProxyWorkerIncomingRequestBody>;

export class ProxyWorker implements DurableObject {
	constructor(readonly state: DurableObjectState, readonly env: Env) {}

	proxyData?: ProxyData;
	requestQueue: Array<{
		request: Request;
		deferredResponse: DeferredPromise<Response>;
	}> = [];

	fetch(request: Request) {
		if (isRequestForLiveReloadWebsocket(request)) {
			// requests for live-reload websocket

			return this.handleLiveReloadWebSocket(request);
		}

		if (isRequestFromProxyController(request, this.env)) {
			// requests from ProxyController

			return this.processProxyControllerRequest(request);
		}

		// regular requests to be proxied
		const deferredResponse = createDeferred<Response>();

		this.requestQueue.push({ request, deferredResponse });
		this.processQueue();

		return deferredResponse.promise;
	}

	handleLiveReloadWebSocket(request: Request) {
		const { 0: response, 1: liveReload } = new WebSocketPair();
		const websocketProtocol =
			request.headers.get("Sec-WebSocket-Protocol") ?? "";

		this.state.acceptWebSocket(liveReload, ["live-reload"]);

		return new Response(null, {
			status: 101,
			webSocket: response,
			headers: { "Sec-WebSocket-Protocol": websocketProtocol },
		});
	}

	processProxyControllerRequest(request: Request) {
		const event = request.cf?.hostMetadata;
		switch (event?.type) {
			case "pause":
				this.proxyData = undefined;
				break;

			case "play":
				this.proxyData = event.proxyData;
				this.processQueue();
				this.state
					.getWebSockets("live-reload")
					.forEach((ws) => ws.send("reload"));

				break;
		}

		return new Response(null, { status: 204 });
	}

	processQueue() {
		const { proxyData } = this; // store proxyData at the moment this function was called
		if (proxyData === undefined) return;

		for (const { request, deferredResponse } of this.requestQueue.splice(0)) {
			const userWorkerUrl = new URL(request.url);
			const headers = new Headers(request.headers);

			// override url parts for proxying
			Object.assign(userWorkerUrl, proxyData.userWorkerUrl);

			// set request.url in the UserWorker
			const innerUrl = new URL(request.url);
			Object.assign(innerUrl, proxyData.userWorkerInnerUrlOverrides);
			headers.set("MF-Original-URL", innerUrl.href);
			headers.set("MF-Disable-Pretty-Error", "true"); // disables the UserWorker miniflare instance from rendering the pretty error -- instead the ProxyWorker miniflare instance will intercept the json error response and render the pretty error page

			// merge proxyData headers with the request headers
			for (const [key, value] of Object.entries(proxyData.headers ?? {})) {
				if (value === undefined) continue;

				if (key.toLowerCase() === "cookie") {
					const existing = request.headers.get("cookie") ?? "";
					headers.set("cookie", `${existing};${value}`);
				} else {
					headers.set(key, value);
				}
			}

			// explicitly NOT await-ing this promise, we are in a loop and want to process the whole queue quickly
			// if we decide to await, we should include a timeout (~100ms) in case the user worker has long-running/parellel requests
			void fetch(userWorkerUrl, new Request(request, { headers }))
				.then((res) => {
					if (isHtmlResponse(res)) {
						res = insertLiveReloadScript(request, res, this.env, proxyData);
					}

					deferredResponse.resolve(res);
				})
				.catch((error: Error) => {
					// errors here are network errors or from response post-processing
					// to catch only network errors, use the 2nd param of the fetch.then()

					// we have crossed an async boundary, so proxyData may have changed
					const newUserWorkerUrl =
						this.proxyData && urlFromParts(this.proxyData.userWorkerUrl);

					// only report errors if the downstream proxy has NOT changed
					if (userWorkerUrl.href === newUserWorkerUrl?.href) {
						void sendMessageToProxyController(this.env, {
							type: "error",
							error: {
								name: error.name,
								message: error.message,
								stack: error.stack,
								cause: error.cause,
							},
						});

						deferredResponse.reject(error);
					}

					// if the request can be retried (subset of idempotent requests which have no body), requeue it
					else if (request.method === "GET" || request.method === "HEAD") {
						this.requestQueue.unshift({ request, deferredResponse });
					}

					// if the request cannot be retried, respond with 503 Service Unavailable
					// important to note, this is not an (unexpected) error -- it is an acceptable flow of local development
					// it would be incorrect to retry non-idempotent requests
					// and would require cloning all body streams to avoid stream reuse (which is inefficient but not out of the question in the future)
					// this is a good enough UX for now since it solves the most common GET use-case
					else {
						deferredResponse.resolve(
							new Response(
								"Your worker restarted mid-request. Please try sending the request again. Only GET or HEAD requests are retried automatically.",
								{
									status: 503,
									headers: { "Retry-After": "0" },
								}
							)
						);
					}
				});
		}
	}
}

function isRequestFromProxyController(req: Request, env: Env): boolean {
	return req.headers.get("Authorization") === env.PROXY_CONTROLLER_AUTH_SECRET;
}
function isHtmlResponse(res: Response): boolean {
	return res.headers.get("content-type")?.startsWith("text/html") ?? false;
}
function isRequestForLiveReloadWebsocket(req: Request): boolean {
	const websocketProtocol = req.headers.get("Sec-WebSocket-Protocol");
	const isWebSocketUpgrade = req.headers.get("Upgrade") === "websocket";

	return isWebSocketUpgrade && websocketProtocol === LIVE_RELOAD_PROTOCOL;
}

function sendMessageToProxyController(
	env: Env,
	message: ProxyWorkerOutgoingRequestBody
) {
	return env.PROXY_CONTROLLER.fetch("http://dummy", {
		method: "POST",
		body: JSON.stringify(message),
	});
}

function insertLiveReloadScript(
	request: Request,
	response: Response,
	env: Env,
	proxyData: ProxyData
) {
	const htmlRewriter = new HTMLRewriter();

	// if preview-token-expired response, errorDetails will contain "Invalid Workers Preview configuration"
	let errorDetails = "";
	htmlRewriter.on("#cf-error-details", {
		text(element) {
			errorDetails += element.text;
		},
	});

	htmlRewriter.onDocument({
		end(end) {
			if (
				response.status === 400 &&
				errorDetails.includes("Invalid Workers Preview configuration")
			) {
				void sendMessageToProxyController(env, {
					type: "previewTokenExpired",
					proxyData,
				});
			}

			// if liveReload enabled, append a script tag
			// TODO: compare to existing nodejs implementation
			if (proxyData.liveReload) {
				const websocketUrl = new URL(request.url);
				websocketUrl.protocol =
					websocketUrl.protocol === "http:" ? "ws:" : "wss:";

				end.append(
					`
					<script>
						(function() {
							var ws;
							function recover() {
								ws = null;
								setTimeout(initLiveReload, 100);
							}
							function initLiveReload() {
								if (ws) return;
                var origin = (location.protocol === "http:" ? "ws://" : "wss://") + location.host;
								ws = new WebSocket(origin + "/cdn-cgi/live-reload", "${LIVE_RELOAD_PROTOCOL}");
								ws.onclose = recover;
								ws.onerror = recover;
								ws.onmessage = location.reload.bind(location);
							}
						})();
					</script>
				`,
					{ html: true }
				);
			}
		},
	});

	return htmlRewriter.transform(response);
}
