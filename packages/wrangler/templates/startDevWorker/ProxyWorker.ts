import assert from "node:assert";
import type {
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
	ProxyData,
} from "../../src/api/startDevWorker/events";
import {
	DeferredPromise,
	createDeferredPromise,
} from "../../src/api/startDevWorker/utils";

interface Env {
	PROXY_CONTROLLER: Fetcher;
	PROXY_CONTROLLER_AUTH_SECRET: string;
	DURABLE_OBJECT: DurableObjectNamespace;
}

type Request = Parameters<
	NonNullable<
		ExportedHandler<Env, unknown, ProxyWorkerIncomingRequestBody>["fetch"]
	>
>[0];

export default {
	fetch(req, env) {
		const singleton = env.DURABLE_OBJECT.idFromName("");
		const inspectorProxy = env.DURABLE_OBJECT.get(singleton);

		return inspectorProxy.fetch(req);
	},
} as ExportedHandler<Env, unknown, ProxyWorkerIncomingRequestBody>;

export class ProxyWorker implements DurableObject {
	constructor(_state: DurableObjectState, readonly env: Env) {}

	proxyData?: ProxyData;
	requestQueue = new Map<Request, DeferredPromise<Response>>();

	fetch(request: Request) {
		if (isRequestFromProxyController(request, this.env)) {
			// requests from ProxyController

			return this.processProxyControllerRequest(request);
		}

		// regular requests to be proxied
		const promise = createDeferredPromise<Response>();

		this.requestQueue.set(request, promise);
		this.processQueue();

		return promise;

		// // this guarantees order in which requests are sent, not delivered
		// //    TODO(consider): `return buffer = buffer.then(...)` to guarantee order of request delivery
		// return this.buffer.then((proxyData) => {
		// 	return processBufferedRequest(request, this.env, proxyData);
		// });
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
				break;
		}

		return new Response(null, { status: 204 });
	}

	processQueue() {
		const { proxyData } = this;
		if (proxyData === undefined) return;

		for (const [request, deferred] of this.requestQueue) {
			this.requestQueue.delete(request);

			const url = new URL(request.url);

			// override url parts for proxying
			Object.assign(url, proxyData.destinationURL);

			for (const [key, value] of Object.entries(proxyData.headers ?? {})) {
				if (key.toLowerCase() === "cookie") {
					const existing = request.headers.get("cookie") ?? "";
					request.headers.set("cookie", `${existing};${value}`);
				} else {
					request.headers.append(key, value);
				}
			}

			void fetch(url, new Request(request, { redirect: "manual" })) // TODO: check if redirect: manual is needed
				.then((res) => {
					if (isHtmlResponse(res)) {
						res = insertLiveReloadScript(res, this.env, proxyData);
					}

					deferred.resolve(res);
				})
				.catch((error: Error) => {
					// errors here are network errors or from response post-processing
					// to catch only network errors, use the 2nd param of the fetch.then()

					void sendMessageToProxyController(this.env, {
						type: "error",
						error: {
							name: error.name,
							message: error.message,
							stack: error.stack,
							cause: error.cause,
						},
					});

					deferred.reject(error);
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

async function sendMessageToProxyController(
	env: Env,
	message: ProxyWorkerOutgoingRequestBody,
	retries = 3
) {
	try {
		await env.PROXY_CONTROLLER.fetch("http://dummy", {
			body: JSON.stringify(message),
		});
	} catch (cause) {
		if (retries > 0) {
			return sendMessageToProxyController(env, message, retries - 1);
		}

		// no point sending an error message if we can't send this message

		throw cause;
	}
}

function insertLiveReloadScript(
	response: Response,
	env: Env,
	proxyData: ProxyData
) {
	const htmlRewriter = new HTMLRewriter();

	// if preview-token-expired response, errorDetails will contain "Invalid Workers Preview configuration"
	let errorDetails = "";
	htmlRewriter.on("#cf-error-derails", {
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
			if (proxyData.liveReloadUrl) {
				end.append(`
					<script>
						(function() {
							var ws;
							function recover() {
								ws = null;
								setTimeout(initLiveReload, 100);
							}
							function initLiveReload() {
								if (ws) return;
								ws = new WebSocket("${proxyData.liveReloadUrl}");
								ws.onclose = recover;
								ws.onerror = recover;
								ws.onmessage = location.reload.bind(location);
							}
						})();
					</script>
				`);
			}
		},
	});

	return htmlRewriter.transform(response);
}
