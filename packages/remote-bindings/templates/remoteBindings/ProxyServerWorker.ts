import { newWorkersRpcResponse } from "capnweb";
import { EmailMessage } from "cloudflare:email";

type Env = Record<string, unknown>;

type SendEmailInput =
	| Parameters<SendEmail["send"]>[0]
	| {
			from: string;
			to: string;
			"EmailMessage::raw": ReadableStream<Uint8Array>;
	  };

class BindingNotFoundError extends Error {
	constructor(name?: string) {
		super(`Binding ${name ? `"${name}"` : ""} not found`);
	}
}

/**
 * For most bindings, we expose them as
 *  - RPC stubs directly to capnweb, or
 *  - HTTP based fetchers
 * However, there are some special cases:
 *  - SendEmail bindings need to take EmailMessage as their first parameter,
 *    which is not serialisable. As such, we reconstruct it before sending it
 *    on to the binding. See packages/miniflare/src/workers/email/email.worker.ts
 *  - Dispatch Namespace bindings have a synchronous .get() method. Since we
 *    can't emulate that over an async boundary, we mock it locally and _actually_
 *    perform the .get() remotely at the first appropriate async point. See
 *    packages/miniflare/src/workers/dispatch-namespace/dispatch-namespace.worker.ts
 *
 * getExposedJSRPCBinding() and getExposedFetcher() perform the logic for figuring out
 * which binding is being accessed, dependending on the request. Note: Both have logic
 * for dispatch namespaces, because dispatch namespaces can use both fetch or RPC depending
 * on context.
 */

function getExposedJSRPCBinding(request: Request, env: Env) {
	const url = new URL(request.url);
	const bindingName = url.searchParams.get("MF-Binding");
	if (!bindingName) {
		throw new BindingNotFoundError();
	}

	const targetBinding = env[bindingName];
	if (!targetBinding) {
		throw new BindingNotFoundError(bindingName);
	}

	if (targetBinding.constructor.name === "SendEmail") {
		return {
			async send(e: SendEmailInput) {
				// Check if this is an EmailMessage (has EmailMessage::raw property) or MessageBuilder
				if ("EmailMessage::raw" in e) {
					// EmailMessage API - reconstruct the EmailMessage object
					const message = new EmailMessage(
						e.from,
						e.to,
						e["EmailMessage::raw"]
					);
					return (targetBinding as SendEmail).send(message);
				} else {
					// MessageBuilder API - pass through directly as a plain object
					return (targetBinding as SendEmail).send(e);
				}
			},
		};
	}

	const dispatchNamespaceOptions = url.searchParams.get(
		"MF-Dispatch-Namespace-Options"
	);
	if (dispatchNamespaceOptions) {
		const { name, args, options } = JSON.parse(dispatchNamespaceOptions);
		return (targetBinding as DispatchNamespace).get(name, args, options);
	}

	return targetBinding;
}

function getExposedFetcher(request: Request, env: Env) {
	const bindingName = request.headers.get("MF-Binding");
	if (!bindingName) {
		throw new BindingNotFoundError();
	}

	const targetBinding = env[bindingName];
	if (!targetBinding) {
		throw new BindingNotFoundError(bindingName);
	}

	// Special case the Dispatch Namespace binding because it has a top-level synchronous .get() call
	const dispatchNamespaceOptions = request.headers.get(
		"MF-Dispatch-Namespace-Options"
	);
	if (dispatchNamespaceOptions) {
		const { name, args, options } = JSON.parse(dispatchNamespaceOptions);
		return (targetBinding as DispatchNamespace).get(name, args, options);
	}
	return targetBinding as Fetcher;
}

/**
 * This Worker can proxy two types of remote binding:
 *  1. "raw" bindings, where this Worker has been configured to pass through the raw
 *     fetch from a local workerd instance to the relevant binding
 *  2. JSRPC bindings, where this Worker uses capnweb to proxy RPC
 *     communication in userland. This is always over a WebSocket connection
 */
function isJSRPCBinding(request: Request): boolean {
	const url = new URL(request.url);
	return request.headers.has("Upgrade") && url.searchParams.has("MF-Binding");
}

/**
 * A raw TCP tunnel request from the local proxy client's `connect` handler: a
 * WebSocket upgrade carrying the target address in `MF-Connect-Address`. We open
 * the binding's socket (routing through the VPC tunnel) and relay bytes between
 * it and the WebSocket in both directions.
 */
function isConnectBinding(request: Request): boolean {
	return (
		request.headers.get("Upgrade") === "websocket" &&
		request.headers.has("MF-Connect-Address")
	);
}

function handleConnect(request: Request, env: Env): Response {
	const address = request.headers.get("MF-Connect-Address")!;
	const fetcher = getExposedFetcher(request, env) as Fetcher;

	const { 0: client, 1: server } = new WebSocketPair();
	server.accept();

	const socket = fetcher.connect(address);
	// Relay runs for the lifetime of the tunnel; failures are surfaced by closing
	// the WebSocket with code 1011 (see pipeSocketOverWebSocket).
	pipeSocketOverWebSocket(socket, server).catch(() => {});

	return new Response(null, { status: 101, webSocket: client });
}

/**
 * Clamp a WebSocket close reason to the protocol's 123-byte limit.
 *
 * `WebSocket.close(code, reason)` requires the reason to be at most 123 UTF-8
 * bytes. Slicing by JavaScript string length (UTF-16 code units) can both
 * overshoot the byte budget and split a multi-byte character, so truncate on a
 * UTF-8 byte boundary instead.
 */
function truncateCloseReason(reason: string): string {
	const bytes = new TextEncoder().encode(reason);
	if (bytes.length <= 123) {
		return reason;
	}
	// Back off to a UTF-8 character boundary: step left over any trailing
	// continuation bytes (10xxxxxx) so we never cut a multi-byte sequence.
	let end = 123;
	while (end > 0 && ((bytes[end] ?? 0) & 0b1100_0000) === 0b1000_0000) {
		end--;
	}
	return new TextDecoder().decode(bytes.subarray(0, end));
}

/**
 * Relay raw TCP bytes between a `connect()` socket and a WebSocket in both
 * directions, propagating close and error state. Mirrors the helper in the
 * Miniflare proxy client (packages/miniflare/src/workers/shared/remote-bindings-utils.ts);
 * this file is bundled standalone for the edge, so the logic is duplicated. Keep
 * the two implementations byte-for-byte identical (comments aside).
 *
 * Both directions are torn down together: when one side finishes — a WebSocket
 * close/error, or the socket reaching EOF / erroring — the opposite direction is
 * actively cancelled (`reader.cancel()` for the socket read, settling the
 * promise for the WebSocket wait), so neither a parked read nor a never-arriving
 * close event can leak the relay or the underlying socket.
 *
 * Note: WebSockets have no backpressure signal, and there is no TCP half-close —
 * when either direction ends the tunnel is torn down in full (the WebSocket is
 * closed and the socket's writable side is closed).
 */
async function pipeSocketOverWebSocket(
	socket: Socket,
	ws: WebSocket
): Promise<void> {
	const writer = socket.writable.getWriter();
	const reader = socket.readable.getReader();

	let wsClosed = false;
	function closeWebSocket(code: number, reason?: string) {
		if (wsClosed) {
			return;
		}
		wsClosed = true;
		try {
			ws.close(
				code,
				reason === undefined ? undefined : truncateCloseReason(reason)
			);
		} catch {
			// Already closing/closed.
		}
	}

	// ws -> socket writes are serialised through this chain to preserve byte
	// order. The writable side is closed exactly once (guarded by `writerClosed`)
	// so both teardown paths below can invoke it idempotently.
	let writeChain = Promise.resolve();
	let writerClosed = false;
	function closeWriter(): Promise<void> {
		if (writerClosed) {
			return Promise.resolve();
		}
		writerClosed = true;
		return writeChain.then(() => writer.close());
	}

	// `fromWebSocket` settles from the ws close/error events, or is settled by the
	// socket -> ws direction once it has closed the ws itself (in which case no
	// inbound close event will arrive to settle it).
	let resolveFromWs!: () => void;
	let rejectFromWs!: (reason: unknown) => void;
	const fromWebSocket = new Promise<void>((resolve, reject) => {
		resolveFromWs = resolve;
		rejectFromWs = reject;
	});

	// WebSocket -> socket. Message events aren't awaited by the runtime, so writes
	// are serialised through the promise chain to preserve byte order.
	ws.addEventListener("message", (event) => {
		const chunk =
			typeof event.data === "string"
				? new TextEncoder().encode(event.data)
				: new Uint8Array(event.data);
		writeChain = writeChain
			.then(() => writer.write(chunk))
			.catch((error) => {
				// A socket write failed: tear the tunnel down rather than leaving the
				// rejection unhandled. Close the ws (1011), cancel the opposite read
				// direction, and reject so the caller sees the failure.
				closeWebSocket(
					1011,
					(error as Error)?.message ?? "socket write failed"
				);
				reader.cancel().catch(() => {});
				rejectFromWs(error);
			});
	});
	ws.addEventListener("close", (event) => {
		wsClosed = true;
		// Actively cancel the opposite direction so a parked `reader.read()` can't
		// keep the socket -> ws relay (and this whole pipe) alive forever.
		reader.cancel().catch(() => {});
		// Close code 1011 signals the remote end errored.
		if (event.code === 1011) {
			rejectFromWs(
				new Error(event.reason || "Remote tunnel closed with an error")
			);
			return;
		}
		// Flush any queued writes, then close the writable side so the caller sees
		// EOF.
		closeWriter().then(resolveFromWs, rejectFromWs);
	});
	ws.addEventListener("error", () => {
		wsClosed = true;
		reader.cancel().catch(() => {});
		rejectFromWs(new Error("Tunnel WebSocket errored"));
	});

	// socket -> WebSocket. On EOF close cleanly (1000); on read error close with
	// 1011 and reject so the caller sees the failure.
	const toWebSocket = (async () => {
		try {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) {
					break;
				}
				// Re-check after the parked read: the ws may have closed while we were
				// waiting. If so, terminate quietly instead of erroring on `send`.
				if (wsClosed) {
					break;
				}
				ws.send(
					value.buffer.slice(
						value.byteOffset,
						value.byteOffset + value.byteLength
					)
				);
			}
			closeWebSocket(1000);
		} catch (error) {
			closeWebSocket(1011, (error as Error).message);
			throw error;
		} finally {
			reader.releaseLock();
			// We closed (or observed the close of) the ws on this side, so no inbound
			// close event will arrive to settle `fromWebSocket`. Close the writable
			// side and settle it here; idempotent with the ws `close` handler above.
			closeWriter().then(resolveFromWs, rejectFromWs);
		}
	})();

	await Promise.all([toWebSocket, fromWebSocket]);
}

export default {
	async fetch(request, env) {
		try {
			if (isConnectBinding(request)) {
				return handleConnect(request, env);
			} else if (isJSRPCBinding(request)) {
				return await newWorkersRpcResponse(
					request,
					getExposedJSRPCBinding(request, env)
				);
			} else {
				const fetcher = getExposedFetcher(request, env);
				const originalHeaders = new Headers();
				for (const [name, value] of request.headers) {
					if (name.startsWith("mf-header-")) {
						originalHeaders.set(name.slice("mf-header-".length), value);
					} else if (name === "upgrade") {
						// The `Upgrade` header needs to be special-cased to prevent:
						//   TypeError: Worker tried to return a WebSocket in a response to a request which did not contain the header "Upgrade: websocket"
						originalHeaders.set(name, value);
					}
				}

				return await fetcher.fetch(
					request.headers.get("MF-URL") ?? "http://example.com",
					new Request(request, {
						redirect: "manual",
						headers: originalHeaders,
					})
				);
			}
		} catch (e) {
			if (e instanceof BindingNotFoundError) {
				return new Response(e.message, { status: 400 });
			}
			return new Response((e as Error).message, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
