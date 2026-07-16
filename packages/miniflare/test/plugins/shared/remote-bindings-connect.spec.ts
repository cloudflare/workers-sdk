import path from "node:path";
// The relay helper under unit test. It is the same implementation bundled into
// miniflare's dist and mirrored (byte-for-byte, comments aside) into the edge
// ProxyServerWorker. It is resolved via a vitest alias (see vitest.config.mts)
// rather than a real path so that its worker-typed source isn't pulled into the
// node-side tsconfig, which excludes `src/workers/**`. tsc has no matching path
// mapping, hence the expected error below.
// @ts-expect-error resolved at runtime by a vitest alias; see vitest.config.mts
import { pipeSocketOverWebSocket } from "@relay-under-test";
import { build } from "esbuild";
import {
	Miniflare,
	remoteProxyClientWorker,
	VPC_SERVICES_PLUGIN,
} from "miniflare";
import { beforeAll, describe, test } from "vitest";
import { useDispose } from "../../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

// The raw-TCP `connect()` tunnel spans two workers:
//  - the Miniflare-side remote-proxy client (built into miniflare's dist), whose
//    inbound `connect` handler tunnels bytes over a WebSocket, and
//  - the edge-side ProxyServerWorker (from the @cloudflare/remote-bindings
//    package), which relays them into the real binding via
//    `env[binding].connect(address)`.
//
// To exercise the real ProxyServerWorker we bundle it (it imports capnweb) and
// run it in a second "edge" Miniflare instance. A `vpc-target` worker with a
// `connect` handler stands in for a private VPC service: it reflects the address
// it observed (proving verbatim propagation) and echoes bytes back.
const PROXY_SERVER_WORKER_PATH = path.resolve(
	__dirname,
	"../../../../remote-bindings/templates/remoteBindings/ProxyServerWorker.ts"
);

const COMPAT_DATE = "2025-01-01";

// Shared bundle of the real edge ProxyServerWorker, built once for the file.
let proxyServerBundle: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: [PROXY_SERVER_WORKER_PATH],
		bundle: true,
		format: "esm",
		target: "esnext",
		platform: "browser",
		// Workers runtime built-ins are provided by workerd, not bundled.
		external: ["cloudflare:*"],
		write: false,
	});
	proxyServerBundle = result.outputFiles[0].text;
});

// Reflects `socket.opened.localAddress` (the verbatim `connect()` address), then
// echoes received bytes, closing once it sees a newline sentinel.
const VPC_TARGET_SCRIPT = /* javascript */ `
	export default {
		async connect(socket) {
			const { localAddress } = await socket.opened;
			const writer = socket.writable.getWriter();
			const enc = new TextEncoder();
			const dec = new TextDecoder();
			await writer.write(enc.encode("ADDR:" + localAddress + "|"));
			const reader = socket.readable.getReader();
			let buf = "";
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				await writer.write(value);
				if (buf.includes("\\n")) break;
			}
			await writer.close();
		},
	};
`;

// Instrumented VPC target used by the close/error matrix. It selects its
// behaviour from the verbatim `connect()` address and records the lifecycle of
// each connection in module globals, exposed over `/state`. Because the relay's
// internal teardown isn't directly observable, `connectDone` (incremented in the
// handler's `finally`) is our proxy signal that the relay actually terminated
// this side of the tunnel — if a direction leaks, the handler parks forever on
// `reader.read()` and `connectDone` never advances.
const INSTRUMENTED_TARGET_SCRIPT = /* javascript */ `
	let connectStarted = 0;
	let connectDone = 0;
	let lastOutcome = "";
	export default {
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname === "/state") {
				return Response.json({ connectStarted, connectDone, lastOutcome });
			}
			return new Response("vpc-target");
		},
		async connect(socket) {
			connectStarted++;
			let outcome = "opening";
			try {
				const { localAddress } = await socket.opened;
				const enc = new TextEncoder();
				const writer = socket.writable.getWriter();
				if (localAddress.startsWith("error")) {
					// (a) Handler errors immediately: aborting the writable errors the
					// socket so the far (user) end sees a failure rather than a clean EOF.
					outcome = "aborted";
					await writer.abort(new Error("vpc target refused connection"));
					return;
				}
				if (localAddress.startsWith("eof")) {
					// (b) Send some data then EOF (close our writable). Then read until
					// our readable reaches EOF, which only happens once the relay has
					// torn down the opposite direction.
					await writer.write(enc.encode("SERVER-DATA\\n"));
					await writer.close();
					const reader = socket.readable.getReader();
					outcome = "sent-eof-waiting-readable-eof";
					for (;;) {
						const { done } = await reader.read();
						if (done) break;
					}
					outcome = "eof-both-sides";
					return;
				}
				// (c) Echo until our readable reaches EOF, i.e. until the user closes
				// first and the relay propagates that close to us.
				outcome = "echo-waiting-user-close";
				const reader = socket.readable.getReader();
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					await writer.write(value);
				}
				await writer.close().catch(() => {});
				outcome = "user-closed";
			} catch (e) {
				outcome = "threw:" + (e && e.message ? e.message : String(e));
			} finally {
				connectDone++;
				lastOutcome = outcome;
			}
		},
	};
`;

// User worker: opens the tunnel via the VPC binding, sends a payload and reads
// the reflected address + echo back.
const USER_SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			const socket = env.VPC.connect("db.internal:3306");
			await socket.opened;
			const writer = socket.writable.getWriter();
			await writer.write(new TextEncoder().encode("PING\\n"));
			writer.releaseLock();
			const reader = socket.readable.getReader();
			const dec = new TextDecoder();
			let out = "";
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				out += dec.decode(value, { stream: true });
				if (out.includes("PING\\n")) break;
			}
			return Response.json({ received: out });
		},
	};
`;

// Matrix user worker. Behaviour is chosen from the `?scenario=` query so a
// single worker can drive every close/error case.
const MATRIX_USER_SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			const scenario = new URL(request.url).searchParams.get("scenario");
			const dec = new TextDecoder();

			if (scenario === "error") {
				// (a) Expect the tunnel to surface the target's failure.
				const socket = env.VPC.connect("error.internal:1");
				try {
					await socket.opened;
					const reader = socket.readable.getReader();
					for (;;) {
						const { done } = await reader.read();
						if (done) break;
					}
					// A clean EOF (no error) also counts as a resolved read loop.
					return Response.json({ errored: false });
				} catch (e) {
					return Response.json({
						errored: true,
						message: e && e.message ? e.message : String(e),
					});
				}
			}

			if (scenario === "eof") {
				// (b) Target sends data then closes; we read to EOF and return without
				// closing our own send side. The relay must still tear the tunnel down.
				const socket = env.VPC.connect("eof.internal:3306");
				await socket.opened;
				const reader = socket.readable.getReader();
				let out = "";
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					out += dec.decode(value, { stream: true });
				}
				return Response.json({ received: out, sawEof: true });
			}

			if (scenario === "userclose") {
				// (c) We write, confirm the echo, then close first.
				const socket = env.VPC.connect("echo.internal:3306");
				await socket.opened;
				const writer = socket.writable.getWriter();
				await writer.write(new TextEncoder().encode("HELLO\\n"));
				const reader = socket.readable.getReader();
				let out = "";
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					out += dec.decode(value, { stream: true });
					if (out.includes("HELLO\\n")) break;
				}
				reader.releaseLock();
				writer.releaseLock();
				await socket.close();
				return Response.json({ received: out, closed: true });
			}

			return new Response("unknown scenario", { status: 400 });
		},
	};
`;

function makeEdge(targetScript: string, directSockets = false): Miniflare {
	return new Miniflare({
		workers: [
			{
				name: "proxy-server",
				compatibilityDate: COMPAT_DATE,
				compatibilityFlags: ["experimental"],
				modules: [
					{
						type: "ESModule",
						path: "ProxyServerWorker.js",
						contents: proxyServerBundle,
					},
				],
				serviceBindings: { VPC: "vpc-target" },
			},
			{
				name: "vpc-target",
				compatibilityDate: COMPAT_DATE,
				compatibilityFlags: ["experimental"],
				modules: true,
				script: targetScript,
				// Enable direct access so the test can read the target's `/state`.
				...(directSockets
					? { unsafeDirectSockets: [{ host: "127.0.0.1" }] }
					: {}),
			},
		],
	});
}

function makeLocal(userScript: string, edgeUrl: URL): Miniflare {
	return new Miniflare({
		modules: true,
		compatibilityDate: COMPAT_DATE,
		script: userScript,
		vpcNetworks: {
			VPC: {
				network_id: "test-network",
				remoteProxyConnectionString:
					edgeUrl as unknown as RemoteProxyConnectionString,
			},
		},
	});
}

// Same as `makeLocal`, but wires the user worker's `VPC` binding through a VPC
// *service* binding rather than a VPC network. VPC services also support
// `connect()`, so the raw-TCP tunnel must work identically.
function makeLocalService(userScript: string, edgeUrl: URL): Miniflare {
	return new Miniflare({
		modules: true,
		compatibilityDate: COMPAT_DATE,
		script: userScript,
		vpcServices: {
			VPC: {
				service_id: "test-service",
				remoteProxyConnectionString:
					edgeUrl as unknown as RemoteProxyConnectionString,
			},
		},
	});
}

type TargetState = {
	connectStarted: number;
	connectDone: number;
	lastOutcome: string;
};

async function readTargetState(edge: Miniflare): Promise<TargetState> {
	const url = await edge.unsafeGetDirectURL("vpc-target");
	const res = await fetch(new URL("/state", url));
	return (await res.json()) as TargetState;
}

// Poll the instrumented target until its connect handler has finished (the relay
// tore this side down), or give up after ~2s and return the last state seen.
async function waitForConnectDone(
	edge: Miniflare,
	expected = 1
): Promise<TargetState> {
	let state = await readTargetState(edge);
	for (let i = 0; i < 100 && state.connectDone < expected; i++) {
		await new Promise((resolve) => setTimeout(resolve, 20));
		state = await readTargetState(edge);
	}
	return state;
}

describe("remote-bindings proxy client: raw TCP connect tunnel", () => {
	test("tunnels bytes end-to-end and forwards the connect address verbatim", async ({
		expect,
	}) => {
		// "Edge" instance running the real ProxyServerWorker, with a VPC binding
		// pointing at a worker that has a `connect` handler.
		const edge = makeEdge(VPC_TARGET_SCRIPT);
		useDispose(edge);
		const edgeUrl = await edge.ready;

		// "Local" instance with the VPC networks binding, routed at the edge above.
		const local = makeLocal(USER_SCRIPT, edgeUrl);
		useDispose(local);

		const response = await local.dispatchFetch("http://localhost/");
		const { received } = (await response.json()) as { received: string };

		// The address the user passed to `binding.connect(...)` must arrive
		// verbatim at the far end of the tunnel.
		expect(received).toContain("ADDR:db.internal:3306|");
		// And bytes must round-trip through the tunnel.
		expect(received).toContain("PING\n");
	});

	// Same round-trip, but the local binding is a VPC *service* rather than a VPC
	// network. Both expose `connect()`, so the raw-TCP tunnel must behave
	// identically through the shared `vpc-services:remote` proxy client.
	test("tunnels bytes end-to-end through a VPC service binding", async ({
		expect,
	}) => {
		const edge = makeEdge(VPC_TARGET_SCRIPT);
		useDispose(edge);
		const edgeUrl = await edge.ready;

		const local = makeLocalService(USER_SCRIPT, edgeUrl);
		useDispose(local);

		const response = await local.dispatchFetch("http://localhost/");
		const { received } = (await response.json()) as { received: string };

		expect(received).toContain("ADDR:db.internal:3306|");
		expect(received).toContain("PING\n");
	});
});

describe("remote-bindings proxy client: connect tunnel close/error matrix", () => {
	// (a) The target's `connect` handler errors immediately (aborts its socket).
	//
	// NOTE ON A HARNESS LIMITATION: Miniflare's service-binding socket layer
	// collapses a mid-tunnel error into a clean EOF, so the user's `opened`/`read`
	// does NOT reject here — it resolves and then sees EOF. The relay's actual
	// reject / 1011 behaviour (which is what surfaces a real VPC failure on a live
	// socket) is instead covered deterministically by the
	// "pipeSocketOverWebSocket: teardown & error propagation" unit tests below.
	// What we *can* assert end-to-end is that a target-side error still terminates
	// the tunnel cleanly, the user request completes (no hang), and the target's
	// handler runs to completion.
	test("a target connect failure terminates the tunnel without hanging", async ({
		expect,
	}) => {
		const edge = makeEdge(INSTRUMENTED_TARGET_SCRIPT, true);
		useDispose(edge);
		const edgeUrl = await edge.ready;

		const local = makeLocal(MATRIX_USER_SCRIPT, edgeUrl);
		useDispose(local);

		const response = await local.dispatchFetch(
			"http://localhost/?scenario=error"
		);
		// The user request completes rather than hanging.
		const result = (await response.json()) as {
			errored: boolean;
			message?: string;
		};
		expect(result).toBeTruthy();

		// The target handler ran and terminated (its `finally` fired).
		const state = await waitForConnectDone(edge);
		expect(state.connectStarted).toBe(1);
		expect(state.connectDone).toBe(1);
		expect(state.lastOutcome).toBe("aborted");
	});

	// (b) The target sends data then closes (EOF). The user reads to EOF and
	// returns WITHOUT closing its own send side. This is the HIGH-1 regression:
	// without cross-direction cancellation the relay would park on the opposite
	// read forever and the target handler would never finish.
	test("tears the relay down when the target half-closes with the user still open", async ({
		expect,
	}) => {
		const edge = makeEdge(INSTRUMENTED_TARGET_SCRIPT, true);
		useDispose(edge);
		const edgeUrl = await edge.ready;

		const local = makeLocal(MATRIX_USER_SCRIPT, edgeUrl);
		useDispose(local);

		const response = await local.dispatchFetch(
			"http://localhost/?scenario=eof"
		);
		const result = (await response.json()) as {
			received: string;
			sawEof: boolean;
		};

		// The user saw the target's data followed by EOF.
		expect(result.received).toContain("SERVER-DATA");
		expect(result.sawEof).toBe(true);

		// The relay must have closed the target's readable side, letting its
		// handler complete. If HIGH-1 regressed, `connectDone` stays 0 here.
		const state = await waitForConnectDone(edge);
		expect(state.connectDone).toBe(1);
		expect(state.lastOutcome).toBe("eof-both-sides");
	});

	// (c) The user closes first. The relay must propagate that close so the
	// target's `connect` handler observes EOF and its pipe is cleaned up.
	test("propagates a user-initiated close to the target pipe", async ({
		expect,
	}) => {
		const edge = makeEdge(INSTRUMENTED_TARGET_SCRIPT, true);
		useDispose(edge);
		const edgeUrl = await edge.ready;

		const local = makeLocal(MATRIX_USER_SCRIPT, edgeUrl);
		useDispose(local);

		const response = await local.dispatchFetch(
			"http://localhost/?scenario=userclose"
		);
		const result = (await response.json()) as {
			received: string;
			closed: boolean;
		};

		// The echo round-tripped before the user closed.
		expect(result.received).toContain("HELLO");
		expect(result.closed).toBe(true);

		// The user-initiated close must reach the target as EOF.
		const state = await waitForConnectDone(edge);
		expect(state.connectDone).toBe(1);
		expect(state.lastOutcome).toBe("user-closed");
	});
});

// --- Focused unit tests for the relay helper ------------------------------
//
// The e2e matrix above proves the tunnel works end-to-end, but Miniflare's
// service-binding socket layer collapses a mid-tunnel *error* into a clean EOF
// (see the (a) test's note), so it can't exercise the relay's reject / 1011
// paths, nor prove that a parked read is actively cancelled. These unit tests
// drive `pipeSocketOverWebSocket` directly with controllable fakes to cover
// exactly those paths deterministically.

type FakeSocket = {
	socket: {
		readable: ReadableStream<Uint8Array>;
		writable: WritableStream<Uint8Array>;
	};
	writes: Uint8Array[];
	writableClosed: () => boolean;
	cancelledWith: () => unknown;
	pushRead: (bytes: Uint8Array) => void;
	endRead: () => void;
	errorRead: (err: unknown) => void;
};

function makeFakeSocket(writeError?: unknown): FakeSocket {
	const writes: Uint8Array[] = [];
	let writableClosed = false;
	const writable = new WritableStream<Uint8Array>({
		write(chunk) {
			if (writeError) {
				throw writeError;
			}
			writes.push(chunk);
		},
		close() {
			writableClosed = true;
		},
		abort() {
			writableClosed = true;
		},
	});

	let controller: ReadableStreamDefaultController<Uint8Array>;
	let cancelled: unknown = undefined;
	let didCancel = false;
	const readable = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
		},
		cancel(reason) {
			didCancel = true;
			cancelled = reason;
		},
	});

	return {
		socket: { readable, writable },
		writes,
		writableClosed: () => writableClosed,
		cancelledWith: () => (didCancel ? { reason: cancelled } : undefined),
		pushRead: (bytes) => controller.enqueue(bytes),
		endRead: () => controller.close(),
		errorRead: (err) => controller.error(err),
	};
}

type FakeWebSocket = {
	ws: {
		addEventListener: (type: string, fn: (event: unknown) => void) => void;
		send: (data: ArrayBuffer) => void;
		close: (code?: number, reason?: string) => void;
	};
	sent: ArrayBuffer[];
	closedWith: () => { code?: number; reason?: string } | undefined;
	emitMessage: (data: ArrayBuffer | string) => void;
	emitClose: (code: number, reason?: string) => void;
	emitError: () => void;
};

function makeFakeWebSocket(): FakeWebSocket {
	const listeners: Record<string, ((event: unknown) => void)[]> = {
		message: [],
		close: [],
		error: [],
	};
	const sent: ArrayBuffer[] = [];
	let closed: { code?: number; reason?: string } | undefined;
	const ws = {
		addEventListener(type: string, fn: (event: unknown) => void) {
			(listeners[type] ??= []).push(fn);
		},
		send(data: ArrayBuffer) {
			sent.push(data);
		},
		close(code?: number, reason?: string) {
			closed ??= { code, reason };
		},
	};

	return {
		ws,
		sent,
		closedWith: () => closed,
		emitMessage: (data) => listeners.message.forEach((fn) => fn({ data })),
		emitClose: (code, reason) =>
			listeners.close.forEach((fn) => fn({ code, reason })),
		emitError: () => listeners.error.forEach((fn) => fn({})),
	};
}

// Let a parked read (and any microtasks) settle before asserting.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("pipeSocketOverWebSocket: teardown & error propagation", () => {
	test("[HIGH-1] a clean WS close cancels the parked socket read and resolves", async ({
		expect,
	}) => {
		const socket = makeFakeSocket();
		const ws = makeFakeWebSocket();
		const pipe = pipeSocketOverWebSocket(socket.socket, ws.ws);

		// The socket->ws direction is parked on `reader.read()` (no data). A clean
		// remote close must cancel it so the pipe resolves instead of hanging.
		await flush();
		ws.emitClose(1000, "");

		await expect(pipe).resolves.toBeUndefined();
		expect(socket.cancelledWith()).not.toBeUndefined();
		expect(socket.writableClosed()).toBe(true);
	});

	test("[HIGH-1] socket EOF closes the WS and settles the WS-wait direction", async ({
		expect,
	}) => {
		const socket = makeFakeSocket();
		const ws = makeFakeWebSocket();
		const pipe = pipeSocketOverWebSocket(socket.socket, ws.ws);

		socket.pushRead(new Uint8Array([1, 2, 3]));
		socket.endRead();

		// The pipe must resolve even though no inbound WS `close` event arrives —
		// the socket->ws direction settles the WS-wait side itself.
		await expect(pipe).resolves.toBeUndefined();
		expect(ws.sent.length).toBe(1);
		expect(ws.closedWith()).toEqual({ code: 1000, reason: undefined });
	});

	test("a remote 1011 close rejects and cancels the opposite direction", async ({
		expect,
	}) => {
		const socket = makeFakeSocket();
		const ws = makeFakeWebSocket();
		const pipe = pipeSocketOverWebSocket(socket.socket, ws.ws);

		await flush();
		ws.emitClose(1011, "remote boom");

		await expect(pipe).rejects.toThrow("remote boom");
		expect(socket.cancelledWith()).not.toBeUndefined();
	});

	test("[LOW-A] a WS error event rejects, cancels the opposite direction, and closes the writer", async ({
		expect,
	}) => {
		const socket = makeFakeSocket();
		const ws = makeFakeWebSocket();
		const pipe = pipeSocketOverWebSocket(socket.socket, ws.ws);

		// The socket->ws direction is parked on `reader.read()`. A WS `error` event
		// must reject the pipe, cancel that parked read, and (via the woken
		// `toWebSocket` finally) close the writable side.
		await flush();
		ws.emitError();

		await expect(pipe).rejects.toThrow("Tunnel WebSocket errored");
		expect(socket.cancelledWith()).not.toBeUndefined();
		// The writer is closed asynchronously by the woken `toWebSocket` finally.
		await flush();
		expect(socket.writableClosed()).toBe(true);
	});

	test("a socket read error closes the WS with 1011 and rejects", async ({
		expect,
	}) => {
		const socket = makeFakeSocket();
		const ws = makeFakeWebSocket();
		const pipe = pipeSocketOverWebSocket(socket.socket, ws.ws);

		socket.errorRead(new Error("read failed"));

		await expect(pipe).rejects.toThrow("read failed");
		expect(ws.closedWith()?.code).toBe(1011);
	});

	test("[LOW-1] a socket write failure tears down with 1011 and rejects", async ({
		expect,
	}) => {
		const socket = makeFakeSocket(new Error("write failed"));
		const ws = makeFakeWebSocket();
		const pipe = pipeSocketOverWebSocket(socket.socket, ws.ws);

		ws.emitMessage(new Uint8Array([9]).buffer);

		await expect(pipe).rejects.toThrow("write failed");
		expect(ws.closedWith()?.code).toBe(1011);
		expect(socket.cancelledWith()).not.toBeUndefined();
	});

	test("[LOW-3] the 1011 close reason is truncated to <=123 UTF-8 bytes on a char boundary", async ({
		expect,
	}) => {
		const socket = makeFakeSocket();
		const ws = makeFakeWebSocket();
		const pipe = pipeSocketOverWebSocket(socket.socket, ws.ws);

		// 200 x "é" = 400 UTF-8 bytes, well over the 123-byte cap and multi-byte so
		// a naive UTF-16 slice could split a character.
		socket.errorRead(new Error("é".repeat(200)));

		await expect(pipe).rejects.toThrow();
		const reason = ws.closedWith()?.reason ?? "";
		expect(new TextEncoder().encode(reason).length).toBeLessThanOrEqual(123);
		// No replacement character => no multi-byte sequence was split.
		expect(reason).not.toContain("�");
	});
});

describe("remoteProxyClientWorker: raw TCP opt-in", () => {
	test("does not enable the experimental flag by default", ({ expect }) => {
		const worker = remoteProxyClientWorker();
		expect(
			(worker as { compatibilityFlags?: string[] }).compatibilityFlags
		).toBeUndefined();
	});

	test("enables the experimental flag when rawTcp is set", ({ expect }) => {
		const worker = remoteProxyClientWorker(undefined, {
			rawTcp: true,
		});
		expect(
			(worker as { compatibilityFlags?: string[] }).compatibilityFlags
		).toEqual(["experimental"]);
	});
});

describe("VPC_SERVICES plugin: raw TCP opt-in", () => {
	test("opts its remote-proxy client service into the experimental flag", async ({
		expect,
	}) => {
		const services = await VPC_SERVICES_PLUGIN.getServices({
			options: {
				vpcServices: {
					VPC: { service_id: "test-service" },
				},
			},
			// The plugin's `getServices` only reads `options`; the remaining fields
			// of the services context are irrelevant to the raw-TCP opt-in.
		} as unknown as Parameters<typeof VPC_SERVICES_PLUGIN.getServices>[0]);

		const serviceList = services as Array<{
			worker?: { compatibilityFlags?: string[] };
		}>;
		expect(serviceList).toHaveLength(1);
		expect(serviceList[0].worker?.compatibilityFlags).toEqual(["experimental"]);
	});
});
