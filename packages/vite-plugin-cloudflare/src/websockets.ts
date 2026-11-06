import { CoreHeaders, coupleWebSocket } from "miniflare";
import { WebSocketServer } from "ws";
import { UNKNOWN_HOST } from "./shared";
import {
	createHeadersForIncomingMessage,
	getForwardedProto,
	resolveRequestTarget,
} from "./utils";
import type { Headers, Miniflare } from "miniflare";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type * as vite from "vite";

/**
 * Handles 'upgrade' requests to the Vite HTTP server and forwards WebSocket events between the client and Worker environments.
 */
export function handleWebSocket(
	httpServer: vite.HttpServer,
	miniflare: Miniflare,
	entryWorkerName?: string,
	viteWebSocketEnabled = false,
	viteProxy?: ViteProxyConfig
) {
	shareViteProxyBypassResults(viteProxy);

	const nodeWebSocket = new WebSocketServer({ noServer: true });

	// Stash Worker 101-response headers keyed by the upgrade request so a single
	// persistent `headers` listener can apply them when `ws` emits the upgrade
	// response. Matches the pattern in `packages/miniflare/src/index.ts`.
	//
	// Using `once()` per upgrade is unsafe: if `ws.handleUpgrade` aborts before
	// emitting `headers` (e.g. malformed `Sec-WebSocket-Key`/`Sec-WebSocket-
	// Version`), the listener stays attached and fires on the next successful
	// upgrade with stale headers leaked from the previous Worker response. The
	// WeakMap entry is GC'd if the request never completes.
	const workerResponseHeaders = new WeakMap<IncomingMessage, Headers>();
	nodeWebSocket.on(
		"headers",
		(responseHeaders: string[], request: IncomingMessage) => {
			const extra = workerResponseHeaders.get(request);
			workerResponseHeaders.delete(request);
			if (extra) {
				appendWorkerResponseHeaders(responseHeaders, extra);
			}
		}
	);

	httpServer.on(
		"upgrade",
		async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			// Socket errors crash Node.js if unhandled
			socket.on("error", () => socket.destroy());

			try {
				const rawHost = request.headers.host ?? UNKNOWN_HOST;
				// Honor `X-Forwarded-Proto` so that the upgrade URL reflects the
				// protocol the original client used (e.g. behind a TLS-terminating
				// reverse proxy or tunnel). Matches `createRequestHandler` in utils.ts.
				const protocol = getForwardedProto(request) ?? "http:";
				const base = /^https?:\/\//i.test(rawHost)
					? rawHost
					: `${protocol}//${rawHost}`;
				const url = resolveRequestTarget(request.url ?? "/", base);

				const isViteRequest =
					request.headers["sec-websocket-protocol"]?.startsWith("vite");
				const isDevToolsRequest = url.pathname === "/__devtools/__ws";
				const isSandboxRequest = hasSandboxOrigin(url.origin);

				// Leave Vite HMR and DevTools upgrades to their own handlers, but
				// forward all sandbox requests to the Worker.
				if ((isViteRequest || isDevToolsRequest) && !isSandboxRequest) {
					// No Vite handler claims HMR upgrades when `server.ws` is disabled.
					if (isViteRequest && !viteWebSocketEnabled) {
						socket.destroy();
					}
					return;
				}

				// Leave upgrades that Vite's own `server.proxy` forwards to its
				// proxy handler. Dispatching them to the Worker would destroy the
				// socket the proxy is using when the Worker has no WebSocket route.
				const workerRequestUrl = await getWorkerUpgradeUrl(request, viteProxy);
				if (workerRequestUrl === undefined) {
					return;
				}

				const headers = createHeadersForIncomingMessage(request);

				if (entryWorkerName) {
					headers.set(CoreHeaders.ROUTE_OVERRIDE, entryWorkerName);
				}

				const response = await miniflare.dispatchFetch(
					new URL(workerRequestUrl, base),
					{
						headers: [...headers],
						method: request.method,
					}
				);
				const workerWebSocket = response.webSocket;

				if (!workerWebSocket) {
					socket.destroy();
					return;
				}

				if (socket.destroyed) {
					return;
				}

				// Forward response headers (e.g. Set-Cookie, custom auth headers) from
				// the Worker's 101 response onto the upgrade response sent to the
				// client. Without this, headers set on a `new Response(null, { status:
				// 101, webSocket, headers })` are silently dropped during `vite dev`,
				// even though they are delivered correctly by `wrangler dev`.
				// See cloudflare/workers-sdk#10390.
				workerResponseHeaders.set(request, response.headers);

				nodeWebSocket.handleUpgrade(
					request,
					socket,
					head,
					async (clientWebSocket) => {
						void coupleWebSocket(clientWebSocket, workerWebSocket);
						nodeWebSocket.emit("connection", clientWebSocket, request);
					}
				);
			} catch {
				// `dispatchFetch` rejects if Miniflare is disposed while an upgrade
				// is still in flight (e.g. during dev server shutdown or restart).
				// This listener is `async`, so an uncaught rejection here escapes as
				// an unhandled rejection — which terminates the Node.js process on
				// modern versions and leaks the client socket. Tear the socket down
				// instead.
				workerResponseHeaders.delete(request);
				socket.destroy();
			}
		}
	);
}

type ViteProxyConfig = Record<string, string | vite.ProxyOptions | undefined>;
type ViteProxyBypass = NonNullable<vite.ProxyOptions["bypass"]>;

const kSharedBypass = Symbol("kSharedBypass");

/**
 * Wraps the `bypass` of each WebSocket entry in `server.proxy` or
 * `preview.proxy` so that it runs once per upgrade request. Both the plugin's
 * `upgrade` listener and Vite's proxy `upgrade` listener call `bypass`, and the
 * wrapper hands the second caller the result of the first call, so a stateful
 * or non-deterministic `bypass` gives both listeners the same answer.
 *
 * Must run before Vite creates its proxy middleware, which copies each entry's
 * options, i.e. in the body of `configureServer` or `configurePreviewServer`.
 *
 * @param viteProxy The resolved `server.proxy` or `preview.proxy` config
 */
export function shareViteProxyBypassResults(viteProxy: ViteProxyConfig = {}) {
	for (const options of Object.values(viteProxy)) {
		if (
			typeof options === "object" &&
			options.bypass &&
			!(kSharedBypass in options.bypass) &&
			isWebSocketProxy(options)
		) {
			options.bypass = shareBypassResultPerUpgrade(options.bypass);
		}
	}
}

function shareBypassResultPerUpgrade(bypass: ViteProxyBypass): ViteProxyBypass {
	const upgradeResults = new WeakMap<
		IncomingMessage,
		ReturnType<ViteProxyBypass>
	>();
	const sharedBypass: ViteProxyBypass = (request, response, options) => {
		// Only upgrades are handled by both listeners; HTTP requests reach
		// `bypass` once, from Vite's proxy middleware.
		if (response !== undefined) {
			return bypass(request, response, options);
		}
		if (!upgradeResults.has(request)) {
			upgradeResults.set(request, callBypass(bypass, request, options));
		}
		return upgradeResults.get(request);
	};
	return Object.assign(sharedBypass, { [kSharedBypass]: true });
}

/**
 * Calls `bypass` for an upgrade, turning a synchronous throw into a rejected
 * promise so that every caller sharing the result sees the error.
 */
function callBypass(
	bypass: ViteProxyBypass,
	request: IncomingMessage,
	options: vite.ProxyOptions
): ReturnType<ViteProxyBypass> {
	try {
		return bypass(request, undefined, options);
	} catch (error) {
		return Promise.reject(error);
	}
}

/**
 * Returns the URL to dispatch a WebSocket upgrade to the Worker with, or
 * `undefined` if Vite's proxy middleware (`server.proxy` or `preview.proxy`)
 * handles the upgrade. Mirrors the `bypass` handling in Vite's proxy `upgrade`
 * listener: a string result rewrites the URL and leaves the upgrade unproxied,
 * so the Worker serves it at that URL; `false` makes Vite respond with a 404;
 * any other result, or an error, leaves the upgrade to Vite.
 *
 * @param request The upgrade request
 * @param viteProxy The resolved `server.proxy` or `preview.proxy` config
 * @returns The URL to dispatch to the Worker, or `undefined` if Vite owns the upgrade
 */
export async function getWorkerUpgradeUrl(
	request: IncomingMessage,
	viteProxy?: ViteProxyConfig
): Promise<string | undefined> {
	const url = request.url ?? "";
	const proxyOptions = findViteProxyWebSocketOptions(url, viteProxy);
	if (!proxyOptions) {
		return url;
	}
	if (!proxyOptions.bypass) {
		return undefined;
	}
	try {
		const bypassResult = await proxyOptions.bypass(
			request,
			undefined,
			proxyOptions
		);
		return typeof bypassResult === "string" ? bypassResult : undefined;
	} catch {
		// Vite logs the error and leaves the upgrade unhandled.
		return undefined;
	}
}

/**
 * Returns the options of the `server.proxy` or `preview.proxy` entry that
 * Vite's proxy middleware uses for a WebSocket upgrade to `url`, if any.
 * Mirrors the `upgrade` listener in Vite's proxy middleware: entries are
 * checked in order, falsy entries are skipped, and the first matching entry
 * that sets `ws` or targets a `ws:`/`wss:` URL handles the upgrade.
 *
 * @param url The raw request URL (`request.url`), as Vite matches it
 * @param viteProxy The resolved `server.proxy` or `preview.proxy` config
 * @returns The matching entry's options, or `undefined` if Vite's proxy does not handle the upgrade
 */
export function findViteProxyWebSocketOptions(
	url: string,
	viteProxy: ViteProxyConfig = {}
): vite.ProxyOptions | undefined {
	for (const [context, options] of Object.entries(viteProxy)) {
		if (!options || !doesProxyContextMatchUrl(context, url)) {
			continue;
		}
		const proxyOptions =
			typeof options === "string" ? { target: options } : options;
		if (isWebSocketProxy(proxyOptions)) {
			return proxyOptions;
		}
	}
	return undefined;
}

/**
 * Mirrors Vite's proxy context matching: a context starting with `^` is a
 * RegExp tested against the URL, otherwise it is a URL prefix.
 */
function doesProxyContextMatchUrl(context: string, url: string): boolean {
	return context.startsWith("^")
		? new RegExp(context).test(url)
		: url.startsWith(context);
}

function isWebSocketProxy(options: vite.ProxyOptions): boolean {
	const target = options.target ? String(options.target) : "";
	return (
		Boolean(options.ws) || target.startsWith("ws:") || target.startsWith("wss:")
	);
}

/**
 * Headers that must not be forwarded on the 101 upgrade response — they are
 * either part of the WebSocket handshake managed by `ws` or irrelevant on a
 * response with no body.
 */
const EXCLUDED_RESPONSE_HEADERS = new Set([
	"connection",
	"content-length",
	"sec-websocket-accept",
	"sec-websocket-extensions",
	"sec-websocket-protocol",
	"transfer-encoding",
	"upgrade",
]);

function appendWorkerResponseHeaders(
	responseHeaders: string[],
	workerHeaders: Headers
) {
	// Iteration preserves separate Set-Cookie values, including commas in Expires.
	for (const [name, value] of workerHeaders) {
		if (EXCLUDED_RESPONSE_HEADERS.has(name)) {
			continue;
		}
		responseHeaders.push(`${name}: ${value}`);
	}
}

/**
 * Matches the origin of a Sandbox SDK preview URL.
 * See: https://developers.cloudflare.com/sandbox/concepts/preview-urls/
 *
 * Pattern: https?://<port(4+ digits)>-<id(no dots)>-<token>.localhost
 *
 * IMPORTANT: The token segment is [a-z0-9_]+ (no hyphens) to prevent ReDoS — two adjacent
 * [^.]+ groups separated by - cause quadratic backtracking on hyphen-heavy input. Tokens are
 * documented as letters/digits/underscores only.
 */
const SANDBOX_ORIGIN_REGEXP =
	/^https?:\/\/\d{4,}-[^.]+-[a-z0-9_]+\.localhost(:\d+)?$/i;

function hasSandboxOrigin(origin: string) {
	return SANDBOX_ORIGIN_REGEXP.test(origin);
}
