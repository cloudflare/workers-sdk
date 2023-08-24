type BufferedRequest = {
	request: Request;
	promise: DeferredPromise<Response>;
};
type ProxyData = {
	pause: boolean;
	destinationURL: Partial<URL>;
	destinationInspectorURL: Partial<URL>;
	headers: Record<string, string>;
	liveReloadUrl: boolean;
};

const buffer = new Map<Request, BufferedRequest>();

let proxyData: ProxyData;

interface Env {
	PROXY_CONTROLLER: Fetcher;
	PROXY_CONTROLLER_AUTH_SECRET: string;
}

export default {
	fetch(request, env) {
		if (isRequestFromProxyController(request, env)) {
			// requests from ProxyController

			proxyData = request.cf?.proxyData as ProxyData;
			processBufferedRequests(env);

			return new Response(null, { status: 204 });
		}

		// regular requests to be proxied

		const promise = createDeferredPromise<Response>();
		buffer.set(request, { request, promise });

		// TODO(maybe): prewarm request to ensure token has not expired

		processBufferedRequests(env);

		return promise;
	},
} as ExportedHandler<Env>;

type MaybePromise<T> = T | Promise<T>;
type DeferredPromise<T> = Promise<T> & {
	resolve: (_: MaybePromise<Response>) => void;
	reject: (_: Error) => void;
};
const createDeferredPromise = <T>(): DeferredPromise<T> => {
	let resolve, reject;
	const promise = new Promise<T>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});

	return Object.assign(promise, {
		resolve,
		reject,
	} as unknown) as DeferredPromise<T>;
};

function isRequestFromProxyController(req: Request, env: Env): boolean {
	return req.headers.get("Authorization") === env.PROXY_CONTROLLER_AUTH_SECRET;
}
function isHtmlResponse(res: Response): boolean {
	return res.headers.get("content-type")?.startsWith("text/html") ?? false;
}

function processBufferedRequests(env: Env) {
	if (proxyData.destinationURL === undefined) return;

	for (const [request, buffered] of buffer) {
		buffer.delete(request);

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
					res = insertLiveReloadScript(res, env);
				}

				buffered.promise.resolve(res);
			})
			.catch((error: Error) => {
				// errors here are network errors or from response post-processing
				// to catch only network errors, use the 2nd param of the fetch.then()

				void sendMessageToProxyController(env, {
					type: "error",
					error: {
						name: error.name,
						message: error.message,
						stack: error.stack,
						cause: error.cause,
					},
				});

				buffered.promise.reject(error);
			});
	}
}

type SerializedError = Pick<Error, "name" | "message" | "stack" | "cause">;
type ProxyControllerOutgoingMessage =
	| { type: "error"; error: SerializedError }
	| { type: "preview-token-expired" };
function sendMessageToProxyController(
	env: Env,
	message: ProxyControllerOutgoingMessage
) {
	return env.PROXY_CONTROLLER.fetch("http://dummy", {
		body: JSON.stringify(message),
	});
}

function insertLiveReloadScript(response: Response, env: Env) {
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
			if (errorDetails.includes("Invalid Workers Preview configuration")) {
				void sendMessageToProxyController(env, {
					type: "preview-token-expired",
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
