import http from "http";
import { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import { Dispatcher, Headers, fetch as baseFetch } from "undici";
import NodeWebSocket from "ws";
import { DeferredPromise } from "../workers";
import { Request, RequestInfo, RequestInit } from "./request";
import { Response } from "./response";
import { WebSocketPair, coupleWebSocket } from "./websocket";

// `Dispatcher`s don't expose whether they had `rejectUnauthorized` set when
// constructed, but we need to know whether to pass this when constructing
// WebSockets. Instead, we add all known `rejectUnauthorized` dispatchers to
// a weak map, and check that before constructing WebSockets.
const allowUnauthorizedDispatchers = new WeakSet<Dispatcher>();
export function registerAllowUnauthorizedDispatcher(dispatcher: Dispatcher) {
	allowUnauthorizedDispatchers.add(dispatcher);
}

const ignored = ["transfer-encoding", "connection", "keep-alive", "expect"];
function headersFromIncomingRequest(req: http.IncomingMessage): Headers {
	const entries = Object.entries(req.headers).filter(
		(pair): pair is [string, string | string[]] => {
			const [name, value] = pair;
			return !ignored.includes(name) && value !== undefined;
		}
	);
	return new Headers(Object.fromEntries(entries));
}

export async function fetch(
	input: RequestInfo,
	init?: RequestInit | Request
): Promise<Response> {
	const requestInit = init as RequestInit;
	const request = new Request(input, requestInit);

	// Handle WebSocket upgrades
	if (
		request.method === "GET" &&
		request.headers.get("upgrade") === "websocket"
	) {
		const url = new URL(request.url);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new TypeError(
				`Fetch API cannot load: ${url.toString()}.\nMake sure you're using http(s):// URLs for WebSocket requests via fetch.`
			);
		}
		url.protocol = url.protocol.replace("http", "ws");

		// Normalise request headers to a format ws understands, extracting the
		// Sec-WebSocket-Protocol header as ws treats this differently
		const headers: Record<string, string> = {};
		let protocols: string[] | undefined;
		for (const [key, value] of request.headers.entries()) {
			if (key.toLowerCase() === "sec-websocket-protocol") {
				protocols = value.split(",").map((protocol) => protocol.trim());
			} else {
				headers[key] = value;
			}
		}

		const rejectUnauthorized =
			requestInit?.dispatcher !== undefined &&
			allowUnauthorizedDispatchers.has(requestInit?.dispatcher)
				? { rejectUnauthorized: false }
				: {};

		// Establish web socket connection
		const ws = new NodeWebSocket(url, protocols, {
			followRedirects: request.redirect === "follow",
			headers,
			...rejectUnauthorized,
		});

		const responsePromise = new DeferredPromise<Response>();
		ws.once("upgrade", (req) => {
			const headers = headersFromIncomingRequest(req);
			// Couple web socket with pair and resolve
			const [worker, client] = Object.values(new WebSocketPair());
			const couplePromise = coupleWebSocket(ws, client);
			const response = new Response(null, {
				status: 101,
				webSocket: worker,
				headers,
			});
			responsePromise.resolve(couplePromise.then(() => response));
		});
		ws.once("unexpected-response", (_, req) => {
			const headers = headersFromIncomingRequest(req);
			const response = new Response(req, {
				status: req.statusCode,
				headers,
			});
			responsePromise.resolve(response);
		});
		return responsePromise;
	}

	const response = await baseFetch(request, {
		dispatcher: requestInit?.dispatcher,
	});
	return new Response(response.body, response);
}

export type DispatchFetch = (
	input: RequestInfo,
	init?: RequestInit<Partial<IncomingRequestCfProperties>>
) => Promise<Response>;
