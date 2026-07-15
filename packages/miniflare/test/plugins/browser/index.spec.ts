import { Miniflare } from "miniflare";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	test,
	type TestOptions,
	vi,
} from "vitest";
import { disposeWithRetry, useDispose } from "../../test-shared";

/**
 * Send a chunked-framing message over a WebSocket.
 *
 * Adapted from https://github.com/cloudflare/puppeteer/blob/b4984452165437e26dd1c8e516581cec2a02b4cd/packages/puppeteer-core/src/cloudflare/chunking.ts#L6-L30
 *
 * @param ws - The WebSocket to send the message on.
 * @param message - The message payload to JSON-serialize and send.
 */
async function sendMessage(ws: WebSocket, message: unknown) {
	const messageToChunks = (data: string): Uint8Array[] => {
		const HEADER_SIZE = 4; // Uint32
		const MAX_MESSAGE_SIZE = 1048575; // Workers size is < 1MB
		const FIRST_CHUNK_DATA_SIZE = MAX_MESSAGE_SIZE - HEADER_SIZE;

		const encoder = new TextEncoder();
		const encodedUint8Array = encoder.encode(data);

		// We only include the header into the first chunk
		const firstChunk = new Uint8Array(
			Math.min(MAX_MESSAGE_SIZE, HEADER_SIZE + encodedUint8Array.length)
		);
		const view = new DataView(firstChunk.buffer);
		view.setUint32(0, encodedUint8Array.length, true);
		firstChunk.set(
			encodedUint8Array.slice(0, FIRST_CHUNK_DATA_SIZE),
			HEADER_SIZE
		);

		const chunks: Uint8Array[] = [firstChunk];
		for (
			let i = FIRST_CHUNK_DATA_SIZE;
			i < data.length;
			i += MAX_MESSAGE_SIZE
		) {
			chunks.push(encodedUint8Array.slice(i, i + MAX_MESSAGE_SIZE));
		}
		return chunks;
	};

	// we need to send the message in chunks
	for (const chunk of messageToChunks(JSON.stringify(message))) {
		ws.send(chunk);
	}
}

/**
 * Wait for a WebSocket connection to be fully closed.
 *
 * @param ws - The WebSocket to wait on.
 * @returns A promise that resolves when the connection is closed.
 */
async function waitForClosedConnection(ws: WebSocket): Promise<void> {
	if (ws.readyState === ws.CLOSED) {
		return;
	}
	await new Promise<void>((resolve) => {
		ws.addEventListener("close", () => {
			if (ws.readyState !== ws.CLOSED) {
				ws.close();
			}
			resolve();
		});
	});
}

/**
 * Wait for a single chunked-framing message from a WebSocket.
 *
 * Reassembles multi-chunk messages using the 4-byte little-endian length
 * header in the first chunk.
 *
 * @param ws - The WebSocket to listen on.
 * @returns A promise that resolves with the parsed JSON message.
 */
async function waitForMessage(ws: WebSocket): Promise<unknown> {
	const chunks: { data: Uint8Array; totalLength: number }[] = [];
	return new Promise((resolve) => {
		ws.addEventListener("message", function handler(event) {
			const data = new Uint8Array(event.data as ArrayBuffer);
			if (chunks.length === 0) {
				// First chunk contains a 4-byte little-endian length header
				const view = new DataView(data.buffer);
				const totalLength = view.getUint32(0, true);
				chunks.push({ data: data.slice(4), totalLength });
			} else {
				chunks[0].data = new Uint8Array([...chunks[0].data, ...data]);
			}
			const accumulated = chunks[0];
			if (accumulated.data.length >= accumulated.totalLength) {
				ws.removeEventListener("message", handler);
				const text = new TextDecoder().decode(
					accumulated.data.slice(0, accumulated.totalLength)
				);
				resolve(JSON.parse(text));
			}
		});
	});
}

const BROWSER_RENDERING_RETRY = {
	retry: {
		condition:
			/Chrome readiness probe .* timed out|Test timed out|connection refused|ConnectEx|WSARecv|ECONNRESET|EPIPE|network connection lost|disconnected/i,
		count: 3,
		delay: 1_000,
	},
} satisfies TestOptions;

/**
 * A single "mega-worker" script that handles all browser rendering test
 * scenarios via URL path routing.  Each test dispatches a fetch to a unique
 * path (e.g. `/session`, `/close`, `/reuse`) and the worker runs the
 * corresponding browser rendering logic.  This allows the entire test suite
 * to share one Miniflare (and therefore one workerd) instance, eliminating
 * ~16 workerd start/stop cycles and the associated cleanup races that cause
 * flakiness on Windows CI runners.
 *
 * Helper functions (`sendMessage`, `waitForClosedConnection`,
 * `waitForMessage`) are embedded via `.toString()` so they are available
 * inside the worker script string.
 */
const MEGA_WORKER_SCRIPT = `
${sendMessage.toString()}
${waitForClosedConnection.toString()}
${waitForMessage.toString()}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		switch (url.pathname) {

			// --- /session: acquire a browser session ---
			case "/session": {
				const resp = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
				return new Response(await resp.text());
			}

			// --- /close: acquire, connect via legacy WS, send Browser.close ---
			case "/close": {
				const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
				const { sessionId } = await acquireResponse.json();
				const { webSocket: ws } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`,
					{ headers: { "Upgrade": "websocket" } }
				);
				ws.accept();
				sendMessage(ws, { method: "Browser.close", id: -1 });
				await waitForClosedConnection(ws);
				return new Response("Browser closed");
			}

			// --- /reuse: acquire, connect, disconnect, reconnect ---
			case "/reuse": {
				const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
				const { sessionId } = await acquireResponse.json();
				const { webSocket: ws } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`,
					{ headers: { "Upgrade": "websocket" } }
				);
				ws.accept();
				ws.close();
				await waitForClosedConnection(ws);

				// Reuse the same session by connecting to it again
				const { webSocket: ws2 } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`,
					{ headers: { "Upgrade": "websocket" } }
				);
				ws2.accept();
				ws2.close();
				return new Response("Browser session reused");
			}

			// --- /reconnect: disconnect and reconnect, sending CDP commands ---
			case "/reconnect": {
				const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
				const { sessionId } = await acquireResponse.json();

				// First connection
				const { webSocket: ws } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`,
					{ headers: { "Upgrade": "websocket" } }
				);
				ws.accept();

				// Send a CDP command and verify we get a response
				sendMessage(ws, { method: "Target.getTargets", id: 1 });
				const msg1 = await waitForMessage(ws);
				if (!msg1 || !msg1.result) {
					return new Response("First CDP command failed: " + JSON.stringify(msg1));
				}

				// Disconnect
				ws.close();
				await waitForClosedConnection(ws);

				// Reconnect with the same sessionId
				const resp2 = await env.MYBROWSER.fetch(
					\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`,
					{ headers: { "Upgrade": "websocket" } }
				);
				if (!resp2.webSocket) {
					return new Response("Reconnect failed with status: " + resp2.status);
				}
				const ws2 = resp2.webSocket;
				ws2.accept();

				// Send a CDP command on the reconnected socket
				sendMessage(ws2, { method: "Target.getTargets", id: 2 });
				const msg2 = await waitForMessage(ws2);
				if (!msg2 || !msg2.result) {
					return new Response("Second CDP command failed: " + JSON.stringify(msg2));
				}

				ws2.close();
				return new Response("Reconnect successful");
			}

			// --- /already-used: try to open two legacy WS connections ---
			case "/already-used": {
				const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
				const { sessionId } = await acquireResponse.json();
				const { webSocket: ws } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`,
					{ headers: { "Upgrade": "websocket" } }
				);
				ws.accept();

				await new Promise(resolve => setTimeout(resolve, 100));

				// try to open new connection for the same session
				const resp2 = await env.MYBROWSER.fetch(
					\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`,
					{ headers: { "Upgrade": "websocket" } }
				);
				if (resp2.status === 409) {
					return new Response("Failed to connect to browser session");
				}
				return new Response("Should not reach here");
			}

			// --- /get-sessions: acquire, connect, close, check sessions ---
			case "/get-sessions": {
				const { sessions: beforeSessions } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(r => r.json());
				const baselineCount = beforeSessions.length;
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
				const { sessions: allAfterAcquire } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(r => r.json());
				// Filter to only our session to avoid interference from other tests
				const ourSession = allAfterAcquire.find(s => s.sessionId === sessionId);
				const newCount = allAfterAcquire.length - baselineCount;

				const { webSocket: ws } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`,
					{ headers: { "Upgrade": "websocket" } }
				);
				ws.accept();

				// send a close message to the browser
				sendMessage(ws, { method: "Browser.close", id: -1 });
				await waitForClosedConnection(ws);
				await new Promise((resolve) => setTimeout(resolve, 1000));

				const { sessions: afterClosedSessions } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(r => r.json());
				const sessionStillPresent = afterClosedSessions.some(s => s.sessionId === sessionId);
				return Response.json({ baselineCount, ourSession, newCount, sessionStillPresent });
			}

			// --- /get-sessions-disconnect: acquire, connect, disconnect, check sessions ---
			case "/get-sessions-disconnect": {
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
				const { webSocket: ws } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`,
					{ headers: { "Upgrade": "websocket" } }
				);
				ws.accept();

				const { sessions: allConnected } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(r => r.json());
				const connectedSession = allConnected.find(s => s.sessionId === sessionId);
				ws.close();
				await waitForClosedConnection(ws);

				const { sessions: allDisconnected } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(r => r.json());
				const disconnectedSession = allDisconnected.find(s => s.sessionId === sessionId);
				return Response.json({ connectedSession, disconnectedSession });
			}

			// --- /limits: proxy to limits endpoint ---
			case "/limits": {
				return env.MYBROWSER.fetch("https://localhost/v1/limits");
			}

			// --- /history: proxy to history endpoint ---
			case "/history": {
				return env.MYBROWSER.fetch("https://localhost/v1/history");
			}

			// --- /devtools-session: list and detail endpoints ---
			case "/devtools-session": {
				const beforeList = await env.MYBROWSER.fetch("https://localhost/v1/devtools/session").then(r => r.json());
				const baselineCount = beforeList.length;
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
				const afterList = await env.MYBROWSER.fetch("https://localhost/v1/devtools/session").then(r => r.json());
				const newCount = afterList.length - baselineCount;
				const ourSession = afterList.find(s => s.sessionId === sessionId);
				const detail = await env.MYBROWSER.fetch(\`https://localhost/v1/devtools/session/\${sessionId}\`).then(r => r.json());
				const missing = await env.MYBROWSER.fetch("https://localhost/v1/devtools/session/does-not-exist");
				return Response.json({ baselineCount, newCount, ourSession, detail, missingStatus: missing.status });
			}

			// --- /devtools-json: json/version, json/list, json endpoints ---
			case "/devtools-json": {
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
				const version = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/json/version\`
				).then(r => r.json());
				const list = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/json/list\`
				).then(r => r.json());
				const listAlias = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/json\`
				).then(r => r.json());
				return Response.json({ version, list, listAlias });
			}

			// --- /devtools-delete: DELETE closes browser session ---
			case "/devtools-delete": {
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
				const { webSocket: ws } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}\`,
					{ headers: { Upgrade: "websocket" } }
				);
				ws.accept();
				const deleteResp = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}\`,
					{ method: "DELETE" }
				);
				const deleteBody = await deleteResp.json();
				// Verify our session is gone after DELETE (filter by sessionId)
				const { sessions } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(r => r.json());
				const sessionGone = !sessions.some(s => s.sessionId === sessionId);
				await waitForClosedConnection(ws);
				const wsClosed = ws.readyState === WebSocket.CLOSED;
				return Response.json({ deleteStatus: deleteResp.status, deleteBody, sessionGone, wsClosed });
			}

			// --- /devtools-browser-ws: POST acquires, GET connects via WS ---
			case "/devtools-browser-ws": {
				const postResp = await env.MYBROWSER.fetch("https://localhost/v1/devtools/browser", {
					method: "POST",
				});
				const { sessionId } = await postResp.json();

				await new Promise(resolve => setTimeout(resolve, 200));

				const getResp = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}\`,
					{ headers: { Upgrade: "websocket" } }
				);
				const sessionIdFromGet = getResp.headers.get("cf-browser-session-id");
				const ws = getResp.webSocket;
				ws.accept();
				const browserVersion = await new Promise((resolve) => {
					ws.addEventListener("message", (m) => resolve(JSON.parse(m.data)));
					ws.send(JSON.stringify({ id: 1, method: "Browser.getVersion" }));
				});
				ws.close();
				return Response.json({
					postStatus: postResp.status,
					sessionId,
					getStatus: getResp.status,
					sessionIdFromGet,
					browserProduct: browserVersion.result?.product,
				});
			}

			// --- /devtools-browser-get: GET acquires and connects in one step ---
			case "/devtools-browser-get": {
				const resp = await env.MYBROWSER.fetch("https://localhost/v1/devtools/browser", {
					headers: { Upgrade: "websocket" },
				});
				const sessionId = resp.headers.get("cf-browser-session-id");
				const ws = resp.webSocket;
				ws.accept();
				const browserVersion = await new Promise((resolve) => {
					ws.addEventListener("message", (m) => resolve(JSON.parse(m.data)));
					ws.send(JSON.stringify({ id: 1, method: "Browser.getVersion" }));
				});
				ws.close();
				return Response.json({
					status: resp.status,
					sessionId,
					browserProduct: browserVersion.result?.product,
				});
			}

			// --- /devtools-protocol: json/protocol endpoint ---
			case "/devtools-protocol": {
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
				const protocol = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/json/protocol\`
				).then(r => r.json());
				return Response.json({ hasDomains: Array.isArray(protocol.domains) });
			}

			// --- /devtools-new-activate-close: json/new, json/activate, json/close ---
			case "/devtools-new-activate-close": {
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
				const newTarget = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/json/new?url=about:blank\`,
					{ method: "PUT" }
				).then(r => r.json());
				const activateResp = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/json/activate/\${newTarget.id}\`
				);
				const closeResp = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/json/close/\${newTarget.id}\`
				);
				return Response.json({
					targetType: newTarget.type,
					activateStatus: activateResp.status,
					closeStatus: closeResp.status,
				});
			}

			// --- /devtools-page-ws: page-level WebSocket endpoint ---
			case "/devtools-page-ws": {
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
				const targets = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/json/list\`
				).then(r => r.json());
				const targetId = targets[0].id;
				const { webSocket: ws } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/page/\${targetId}\`,
					{ headers: { Upgrade: "websocket" } }
				);
				ws.accept();
				const result = await new Promise((resolve) => {
					ws.addEventListener("message", (m) => resolve(JSON.parse(m.data)));
					ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "1+1" } }));
				});
				ws.close();
				return Response.json({ resultValue: result.result?.result?.value });
			}

			// --- /devtools-delete-no-ws: DELETE without prior WebSocket ---
			case "/devtools-delete-no-ws": {
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
				const deleteResp = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}\`,
					{ method: "DELETE" }
				);
				const deleteBody = await deleteResp.json();
				const { sessions } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(r => r.json());
				return Response.json({
					deleteStatus: deleteResp.status,
					deleteBody,
					sessionGone: !sessions.some(s => s.sessionId === sessionId),
				});
			}

			// --- /devtools-delete-all-ws: DELETE closes browser + page WebSockets ---
			case "/devtools-delete-all-ws": {
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());

				// Connect browser-level WebSocket
				const { webSocket: browserWs } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}\`,
					{ headers: { Upgrade: "websocket" } }
				);
				browserWs.accept();

				// Connect page-level WebSocket
				const targets = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/json/list\`
				).then(r => r.json());
				const { webSocket: pageWs } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}/page/\${targets[0].id}\`,
					{ headers: { Upgrade: "websocket" } }
				);
				pageWs.accept();

				// DELETE should close everything
				const deleteResp = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}\`,
					{ method: "DELETE" }
				);
				const deleteBody = await deleteResp.json();

				await Promise.all([
					waitForClosedConnection(browserWs),
					waitForClosedConnection(pageWs),
				]);

				return Response.json({
					deleteStatus: deleteResp.status,
					deleteBody,
					browserWsClosed: browserWs.readyState === WebSocket.CLOSED,
					pageWsClosed: pageWs.readyState === WebSocket.CLOSED,
				});
			}

			// --- /devtools-concurrent-ws: multiple raw WS connections ---
			case "/devtools-concurrent-ws": {
				const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());

				// Open two raw WebSocket connections to the same browser session
				const { webSocket: ws1 } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}\`,
					{ headers: { Upgrade: "websocket" } }
				);
				ws1.accept();

				const { webSocket: ws2 } = await env.MYBROWSER.fetch(
					\`https://localhost/v1/devtools/browser/\${sessionId}\`,
					{ headers: { Upgrade: "websocket" } }
				);
				ws2.accept();

				// Send Browser.getVersion on both and verify responses
				const v1 = new Promise((resolve) => {
					ws1.addEventListener("message", (m) => resolve(JSON.parse(m.data)));
					ws1.send(JSON.stringify({ id: 1, method: "Browser.getVersion" }));
				});
				const v2 = new Promise((resolve) => {
					ws2.addEventListener("message", (m) => resolve(JSON.parse(m.data)));
					ws2.send(JSON.stringify({ id: 2, method: "Browser.getVersion" }));
				});

				const [r1, r2] = await Promise.all([v1, v2]);
				ws1.close();
				ws2.close();

				return Response.json({
					product1: r1.result?.product,
					product2: r2.result?.product,
				});
			}

			default:
				return new Response("Unknown route: " + url.pathname, { status: 404 });
		}
	}
};
`;

// We need to run browser rendering tests in a serial manner to avoid a race condition installing the browser.
// We set the timeout quite high here as one of these tests will need to download the Chrome headless browser.
describe.sequential("browser rendering", { timeout: 120_000 }, () => {
	// Shared Miniflare instance for all tests except the multi-binding test.
	// A single workerd process is reused across all tests, eliminating ~16
	// start/stop cycles and their associated cleanup races.
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			name: "worker",
			compatibilityDate: "2024-11-20",
			modules: true,
			script: MEGA_WORKER_SCRIPT,
			browserRendering: { binding: "MYBROWSER" },
		});
	});

	afterAll(() => disposeWithRetry(mf));

	// The CLI spinner outputs to stdout, so we mute it during tests
	beforeEach(() => {
		vi.spyOn(process.stdout, "write").mockImplementation(() => true);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test(
		"it creates a browser session",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const res = await mf.dispatchFetch("https://localhost/session");
			const text = await res.text();
			expect(text.includes("sessionId")).toBe(true);
		}
	);

	test(
		"two workers with different browser bindings can coexist",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const workerScript = (bindingName: string) => `
			export default {
				async fetch(request, env) {
					if (request.url.endsWith("session")) {
						const newBrowserSession = await env.${bindingName}.fetch("https://localhost/v1/acquire")
						return new Response(await newBrowserSession.text())
					}
				}
			};
			`;
			const multiMf = new Miniflare({
				workers: [
					{
						name: "worker-a",
						compatibilityDate: "2024-11-20",
						modules: true,
						script: workerScript("BROWSER_A"),
						browserRendering: { binding: "BROWSER_A" },
					},
					{
						name: "worker-b",
						compatibilityDate: "2024-11-20",
						modules: true,
						script: workerScript("BROWSER_B"),
						browserRendering: { binding: "BROWSER_B" },
					},
				],
			});
			useDispose(multiMf);

			const res = await multiMf.dispatchFetch("https://localhost/session");
			const text = await res.text();
			expect(text.includes("sessionId")).toBe(true);
		}
	);

	test(
		"it closes a browser session",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const res = await mf.dispatchFetch("https://localhost/close");
			expect(await res.text()).toBe("Browser closed");
		}
	);

	test(
		"it reuses a browser session",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const res = await mf.dispatchFetch("https://localhost/reuse");
			expect(await res.text()).toBe("Browser session reused");
		}
	);

	test(
		"it reconnects and sends CDP commands after disconnect",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const res = await mf.dispatchFetch("https://localhost/reconnect");
			expect(await res.text()).toBe("Reconnect successful");
		}
	);

	test.skipIf(process.platform === "win32")(
		"fails if browser session already in use",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const res = await mf.dispatchFetch("https://localhost/already-used");
			expect(await res.text()).toBe("Failed to connect to browser session");
		}
	);

	test(
		"gets sessions while acquiring and closing session",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { ourSession, newCount, sessionStillPresent } = (await mf
				.dispatchFetch("https://localhost/get-sessions")
				.then((res) => res.json())) as any;
			// Exactly one new session should have been added by this test's acquire
			expect(newCount).toBe(1);
			expect(
				typeof ourSession.sessionId === "string" &&
					typeof ourSession.startTime === "number" &&
					!ourSession.connectionId
			).toBe(true);
			// After Browser.close, our session should no longer be listed
			expect(sessionStillPresent).toBe(false);
		}
	);

	test(
		"gets sessions while connecting and disconnecting session",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { connectedSession, disconnectedSession } = (await mf
				.dispatchFetch("https://localhost/get-sessions-disconnect")
				.then((res) => res.json())) as any;
			expect(connectedSession.sessionId).toBe(disconnectedSession.sessionId);
			expect(
				typeof connectedSession.connectionId === "string" &&
					typeof connectedSession.connectionStartTime === "number"
			).toBe(true);
			expect(
				!disconnectedSession.connectionId &&
					!disconnectedSession.connectionStartTime
			).toBe(true);
		}
	);

	test("returns limits", async ({ expect }) => {
		const res = await mf.dispatchFetch("https://localhost/limits");
		const body = (await res.json()) as any;
		expect(res.status).toBe(200);
		expect(typeof body.maxConcurrentSessions).toBe("number");
		expect(typeof body.allowedBrowserAcquisitions).toBe("number");
		expect(typeof body.timeUntilNextAllowedBrowserAcquisition).toBe("number");
	});

	test("returns empty history", async ({ expect }) => {
		const res = await mf.dispatchFetch("https://localhost/history");
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body).toEqual([]);
	});

	test(
		"devtools session list and detail endpoints",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { newCount, ourSession, detail, missingStatus } = (await mf
				.dispatchFetch("https://localhost/devtools-session")
				.then((r) => r.json())) as any;

			// Exactly one new session should appear after acquire
			expect(newCount).toBe(1);
			expect(typeof ourSession.sessionId).toBe("string");
			expect(detail.sessionId).toBe(ourSession.sessionId);
			expect(missingStatus).toBe(404);
		}
	);

	test(
		"devtools json/version, json/list, json endpoints",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { version, list, listAlias } = (await mf
				.dispatchFetch("https://localhost/devtools-json")
				.then((r) => r.json())) as any;

			expect(typeof version.Browser).toBe("string");
			expect(typeof version["Protocol-Version"]).toBe("string");
			expect(Array.isArray(list)).toBe(true);
			// The page title for about:blank can change between sequential
			// requests (from "" to "about:blank"), so strip the volatile
			// `title` field before comparing the two alias endpoints.
			const stripTitle = (arr: any[]) =>
				arr.map(({ title, ...rest }: any) => rest);
			expect(stripTitle(list)).toEqual(stripTitle(listAlias));
		}
	);

	test(
		"DELETE /v1/devtools/browser/:session_id closes browser",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { deleteStatus, deleteBody, sessionGone, wsClosed } = (await mf
				.dispatchFetch("https://localhost/devtools-delete")
				.then((r) => r.json())) as any;

			expect(deleteStatus).toBe(200);
			expect(deleteBody.status).toBe("closed");
			expect(sessionGone).toBe(true);
			expect(wsClosed).toBe(true);
		}
	);

	test(
		"POST /v1/devtools/browser acquires session, GET /v1/devtools/browser/:id connects and returns cf-browser-session-id",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const {
				postStatus,
				sessionId,
				getStatus,
				sessionIdFromGet,
				browserProduct,
			} = (await mf
				.dispatchFetch("https://localhost/devtools-browser-ws")
				.then((r) => r.json())) as any;

			expect(postStatus).toBe(200);
			expect(typeof sessionId).toBe("string");
			expect(getStatus).toBe(101);
			expect(sessionIdFromGet).toBe(sessionId);
			expect(typeof browserProduct).toBe("string");
			expect(browserProduct).toContain("Chrome");
		}
	);

	test(
		"GET /v1/devtools/browser acquires and connects",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { status, sessionId, browserProduct } = (await mf
				.dispatchFetch("https://localhost/devtools-browser-get")
				.then((r) => r.json())) as any;

			expect(status).toBe(101);
			expect(typeof sessionId).toBe("string");
			expect(typeof browserProduct).toBe("string");
			expect(browserProduct).toContain("Chrome");
		}
	);

	test(
		"devtools json/protocol endpoint",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { hasDomains } = (await mf
				.dispatchFetch("https://localhost/devtools-protocol")
				.then((r) => r.json())) as any;

			expect(hasDomains).toBe(true);
		}
	);

	test(
		"devtools json/new, json/activate, json/close endpoints",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { targetType, activateStatus, closeStatus } = (await mf
				.dispatchFetch("https://localhost/devtools-new-activate-close")
				.then((r) => r.json())) as any;

			expect(targetType).toBe("page");
			expect(activateStatus).toBe(200);
			expect(closeStatus).toBe(200);
		}
	);

	test(
		"devtools page/:target_id WebSocket endpoint",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { resultValue } = (await mf
				.dispatchFetch("https://localhost/devtools-page-ws")
				.then((r) => r.json())) as any;

			expect(resultValue).toBe(2);
		}
	);

	test(
		"DELETE without prior WebSocket connection",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { deleteStatus, deleteBody, sessionGone } = (await mf
				.dispatchFetch("https://localhost/devtools-delete-no-ws")
				.then((r) => r.json())) as any;

			expect(deleteStatus).toBe(200);
			expect(deleteBody.status).toBe("closed");
			expect(sessionGone).toBe(true);
		}
	);

	test(
		"DELETE closes all WebSocket connections (browser + page)",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { deleteStatus, deleteBody, browserWsClosed, pageWsClosed } =
				(await mf
					.dispatchFetch("https://localhost/devtools-delete-all-ws")
					.then((r) => r.json())) as any;

			expect(deleteStatus).toBe(200);
			expect(deleteBody.status).toBe("closed");
			expect(browserWsClosed).toBe(true);
			expect(pageWsClosed).toBe(true);
		}
	);

	test(
		"multiple concurrent raw WebSocket connections to same session",
		BROWSER_RENDERING_RETRY,
		async ({ expect }) => {
			const { product1, product2 } = (await mf
				.dispatchFetch("https://localhost/devtools-concurrent-ws")
				.then((r) => r.json())) as any;

			expect(typeof product1).toBe("string");
			expect(product1).toContain("Chrome");
			expect(typeof product2).toBe("string");
			expect(product2).toContain("Chrome");
		}
	);
});
