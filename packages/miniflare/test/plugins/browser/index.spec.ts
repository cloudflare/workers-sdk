import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { useDispose } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

async function sendMessage(ws: WebSocket, message: unknown) {
	// adapted from https://github.com/cloudflare/puppeteer/blob/b4984452165437e26dd1c8e516581cec2a02b4cd/packages/puppeteer-core/src/cloudflare/chunking.ts#L6-L30
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

async function waitForClosedConnection(ws: WebSocket): Promise<void> {
	if (ws.readyState === ws.CLOSED) {
		return;
	}
	await new Promise<void>((resolve) => {
		ws.addEventListener("close", () => {
			ws.close();
			resolve();
		});
	});
}

const BROWSER_WORKER_SCRIPT = () => `
export default {
	async fetch(request, env) {
		if (request.url.endsWith("session")) {
			const newBrowserSession = await env.MYBROWSER.fetch("https://localhost/v1/acquire")
			return new Response(await newBrowserSession.text())
		}
	}
};
`;

// We need to run browser rendering tests in a serial manner to avoid a race condition installing the browser.
// We set the timeout quite high here as one of these tests will need to download the Chrome headless browser.
describe.sequential("browser rendering", { timeout: 20_000 }, () => {
	// The CLI spinner outputs to stdout, so we mute it during tests
	beforeEach(() => {
		vi.spyOn(process.stdout, "write").mockImplementation(() => true);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("it creates a browser session", { retry: 3 }, async ({ expect }) => {
		const opts: MiniflareOptions = {
			name: "worker",
			compatibilityDate: "2024-11-20",
			modules: true,
			script: BROWSER_WORKER_SCRIPT(),
			browserRendering: { binding: "MYBROWSER" },
		};
		const mf = new Miniflare(opts);
		useDispose(mf);

		const res = await mf.dispatchFetch("https://localhost/session");
		const text = await res.text();
		expect(text.includes("sessionId")).toBe(true);
	});

	const BROWSER_WORKER_CLOSE_SCRIPT = `
${sendMessage.toString()}
${waitForClosedConnection.toString()}

export default {
	async fetch(request, env) {
		const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
		const { sessionId } = await acquireResponse.json();
		const { webSocket: ws } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		ws.accept();

		sendMessage(ws, { method: "Browser.close", id: -1 });
		await waitForClosedConnection(ws);

		return new Response("Browser closed");
	}
};
`;

	test("it closes a browser session", { retry: 3 }, async ({ expect }) => {
		const opts: MiniflareOptions = {
			name: "worker",
			compatibilityDate: "2024-11-20",
			modules: true,
			script: BROWSER_WORKER_CLOSE_SCRIPT,
			browserRendering: { binding: "MYBROWSER" },
		};
		const mf = new Miniflare(opts);
		useDispose(mf);

		const res = await mf.dispatchFetch("https://localhost/close");
		expect(await res.text()).toBe("Browser closed");
	});

	const BROWSER_WORKER_REUSE_SCRIPT = `
${sendMessage.toString()}
${waitForClosedConnection.toString()}

export default {
	async fetch(request, env) {
		const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
		const { sessionId } = await acquireResponse.json();
		const { webSocket: ws } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		ws.accept();
		ws.close();

		await waitForClosedConnection(ws);

		// Reuse the same session by connecting to it again
		const { webSocket: ws2 } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		ws2.accept();
		ws2.close();

		return new Response("Browser session reused");
	}
};
`;

	test("it reuses a browser session", { retry: 3 }, async ({ expect }) => {
		const opts: MiniflareOptions = {
			name: "worker",
			compatibilityDate: "2024-11-20",
			modules: true,
			script: BROWSER_WORKER_REUSE_SCRIPT,
			browserRendering: { binding: "MYBROWSER" },
		};
		const mf = new Miniflare(opts);
		useDispose(mf);

		const res = await mf.dispatchFetch("https://localhost");
		expect(await res.text()).toBe("Browser session reused");
	});

	const BROWSER_WORKER_RECONNECT_SCRIPT = `
${sendMessage.toString()}
${waitForClosedConnection.toString()}

async function waitForMessage(ws) {
	const chunks = [];
	return new Promise((resolve) => {
		ws.addEventListener("message", function handler(event) {
			const data = new Uint8Array(event.data);
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
				const text = new TextDecoder().decode(accumulated.data.slice(0, accumulated.totalLength));
				resolve(JSON.parse(text));
			}
		});
	});
}

export default {
	async fetch(request, env) {
		const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
		const { sessionId } = await acquireResponse.json();

		// First connection
		const { webSocket: ws } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
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
		const resp2 = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
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
};
`;

	test(
		"it reconnects and sends CDP commands after disconnect",
		{ retry: 3 },
		async ({ expect }) => {
			const opts: MiniflareOptions = {
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: BROWSER_WORKER_RECONNECT_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			};
			const mf = new Miniflare(opts);
			useDispose(mf);

			const res = await mf.dispatchFetch("https://localhost");
			expect(await res.text()).toBe("Reconnect successful");
		}
	);

	const BROWSER_WORKER_ALREADY_USED_SCRIPT = `
export default {
	async fetch(request, env) {
		const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
		const { sessionId } = await acquireResponse.json();
		const { webSocket: ws } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		ws.accept();

		await new Promise(resolve => setTimeout(resolve, 100));

		// try to open new connection for the same session
		const resp2 = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		if (resp2.status === 409) {
			return new Response("Failed to connect to browser session");
		}

		return new Response("Should not reach here");
	}
};
`;

	test.skipIf(process.platform === "win32")(
		"fails if browser session already in use",
		async ({ expect }) => {
			const opts: MiniflareOptions = {
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: BROWSER_WORKER_ALREADY_USED_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			};
			const mf = new Miniflare(opts);
			useDispose(mf);

			const res = await mf.dispatchFetch("https://localhost");
			expect(await res.text()).toBe("Failed to connect to browser session");
		}
	);

	const GET_SESSIONS_SCRIPT = `
${sendMessage.toString()}
${waitForClosedConnection.toString()}

export default {
	async fetch(request, env) {
		const { sessions: emptySessions } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(res => res.json());
		const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(res => res.json());
		const { sessions: acquiredSessions } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(res => res.json());

		const { webSocket: ws } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		ws.accept();

		// send a close message to the browser
		sendMessage(ws, { method: "Browser.close", id: -1 });

		await waitForClosedConnection(ws);

		await new Promise((resolve) => setTimeout(resolve, 1000));

		const { sessions: afterClosedSessions } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(res => res.json());

		return Response.json({ emptySessions, acquiredSessions, afterClosedSessions });
	}
};
`;

	test(
		"gets sessions while acquiring and closing session",
		{ retry: 3 },
		async ({ expect }) => {
			const opts: MiniflareOptions = {
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: GET_SESSIONS_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			};
			const mf = new Miniflare(opts);
			useDispose(mf);

			const { emptySessions, acquiredSessions, afterClosedSessions } = (await mf
				.dispatchFetch("https://localhost")
				.then((res) => res.json())) as any;
			expect(emptySessions.length).toBe(0);
			expect(acquiredSessions.length).toBe(1);
			expect(
				typeof acquiredSessions[0].sessionId === "string" &&
					typeof acquiredSessions[0].startTime === "number" &&
					!acquiredSessions[0].connectionId &&
					!acquiredSessions[0].connectionId
			).toBe(true);
			expect(afterClosedSessions.length).toBe(0);
		}
	);

	const GET_SESSIONS_AFTER_DISCONNECT_SCRIPT = `
${waitForClosedConnection.toString()}

export default {
	async fetch(request, env) {
		const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(res => res.json());
		const { webSocket: ws } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		ws.accept();

		const { sessions: [connectedSession] } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(res => res.json());
		ws.close();

		await waitForClosedConnection(ws);

		const { sessions: [disconnectedSession] } = await env.MYBROWSER.fetch("https://localhost/v1/sessions").then(res => res.json());

		return Response.json({ connectedSession, disconnectedSession });
	}
};
`;

	test(
		"gets sessions while connecting and disconnecting session",
		{ retry: 3 },
		async ({ expect }) => {
			const opts: MiniflareOptions = {
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: GET_SESSIONS_AFTER_DISCONNECT_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			};
			const mf = new Miniflare(opts);
			useDispose(mf);

			const { connectedSession, disconnectedSession } = (await mf
				.dispatchFetch("https://localhost")
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
		const mf = new Miniflare({
			name: "worker",
			compatibilityDate: "2024-11-20",
			modules: true,
			script: `export default { async fetch(req, env) {
				return env.MYBROWSER.fetch("https://localhost/v1/limits");
			} }`,
			browserRendering: { binding: "MYBROWSER" },
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("https://localhost");
		const body = (await res.json()) as any;
		expect(res.status).toBe(200);
		expect(typeof body.maxConcurrentSessions).toBe("number");
		expect(typeof body.allowedBrowserAcquisitions).toBe("number");
		expect(typeof body.timeUntilNextAllowedBrowserAcquisition).toBe("number");
	});

	test("returns empty history", async ({ expect }) => {
		const mf = new Miniflare({
			name: "worker",
			compatibilityDate: "2024-11-20",
			modules: true,
			script: `export default { async fetch(req, env) {
				return env.MYBROWSER.fetch("https://localhost/v1/history");
			} }`,
			browserRendering: { binding: "MYBROWSER" },
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("https://localhost");
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body).toEqual([]);
	});

	const DEVTOOLS_SESSION_SCRIPT = `
export default {
	async fetch(request, env) {
		const emptyList = await env.MYBROWSER.fetch("https://localhost/v1/devtools/session").then(r => r.json());
		const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
		const list = await env.MYBROWSER.fetch("https://localhost/v1/devtools/session").then(r => r.json());
		const detail = await env.MYBROWSER.fetch(\`https://localhost/v1/devtools/session/\${sessionId}\`).then(r => r.json());
		const missing = await env.MYBROWSER.fetch("https://localhost/v1/devtools/session/does-not-exist");
		return Response.json({ emptyList, list, detail, missingStatus: missing.status });
	}
};
`;

	test(
		"devtools session list and detail endpoints",
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: DEVTOOLS_SESSION_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const { emptyList, list, detail, missingStatus } = (await mf
				.dispatchFetch("https://localhost")
				.then((r) => r.json())) as any;

			expect(emptyList).toEqual([]);
			expect(list.length).toBe(1);
			expect(typeof list[0].sessionId).toBe("string");
			expect(detail.sessionId).toBe(list[0].sessionId);
			expect(missingStatus).toBe(404);
		}
	);

	const DEVTOOLS_JSON_SCRIPT = `
export default {
	async fetch(request, env) {
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
};
`;

	test(
		"devtools json/version, json/list, json endpoints",
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: DEVTOOLS_JSON_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const { version, list, listAlias } = (await mf
				.dispatchFetch("https://localhost")
				.then((r) => r.json())) as any;

			expect(typeof version.Browser).toBe("string");
			expect(typeof version["Protocol-Version"]).toBe("string");
			expect(Array.isArray(list)).toBe(true);
			expect(list).toEqual(listAlias);
		}
	);

	const DEVTOOLS_DELETE_SCRIPT = `
${waitForClosedConnection.toString()}

export default {
	async fetch(request, env) {
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
		// Verify the session is gone after DELETE
		const { sessions } = await env.MYBROWSER.fetch(\`https://localhost/v1/sessions?sessionId=\${sessionId}\`).then(r => r.json());
		const sessionGone = sessions.length === 0;
		await waitForClosedConnection(ws);
		const wsClosed = ws.readyState === WebSocket.CLOSED;
		return Response.json({
			deleteStatus: deleteResp.status,
			deleteBody,
			sessionGone,
			wsClosed,
		});
	}
};
`;

	test(
		"DELETE /v1/devtools/browser/:session_id closes browser",
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: DEVTOOLS_DELETE_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const { deleteStatus, deleteBody, sessionGone, wsClosed } = (await mf
				.dispatchFetch("https://localhost")
				.then((r) => r.json())) as any;

			expect(deleteStatus).toBe(200);
			expect(deleteBody.status).toBe("closed");
			expect(sessionGone).toBe(true);
			expect(wsClosed).toBe(true);
		}
	);

	const DEVTOOLS_BROWSER_WS_SCRIPT = `
export default {
	async fetch(request, env) {
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
};
`;

	test(
		"POST /v1/devtools/browser acquires session, GET /v1/devtools/browser/:id connects and returns cf-browser-session-id",
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: DEVTOOLS_BROWSER_WS_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const {
				postStatus,
				sessionId,
				getStatus,
				sessionIdFromGet,
				browserProduct,
			} = (await mf
				.dispatchFetch("https://localhost")
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
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: `export default {
	async fetch(request, env) {
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
		return Response.json({ status: resp.status, sessionId, browserProduct: browserVersion.result?.product });
	}
};`,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const { status, sessionId, browserProduct } = (await mf
				.dispatchFetch("https://localhost")
				.then((r) => r.json())) as any;

			expect(status).toBe(101);
			expect(typeof sessionId).toBe("string");
			expect(typeof browserProduct).toBe("string");
			expect(browserProduct).toContain("Chrome");
		}
	);

	const DEVTOOLS_JSON_PROTOCOL_SCRIPT = `
export default {
	async fetch(request, env) {
		const { sessionId } = await env.MYBROWSER.fetch("https://localhost/v1/acquire").then(r => r.json());
		const protocol = await env.MYBROWSER.fetch(
			\`https://localhost/v1/devtools/browser/\${sessionId}/json/protocol\`
		).then(r => r.json());
		return Response.json({ hasDomains: Array.isArray(protocol.domains) });
	}
};
`;

	test("devtools json/protocol endpoint", { retry: 3 }, async ({ expect }) => {
		const mf = new Miniflare({
			name: "worker",
			compatibilityDate: "2024-11-20",
			modules: true,
			script: DEVTOOLS_JSON_PROTOCOL_SCRIPT,
			browserRendering: { binding: "MYBROWSER" },
		});
		useDispose(mf);

		const { hasDomains } = (await mf
			.dispatchFetch("https://localhost")
			.then((r) => r.json())) as any;

		expect(hasDomains).toBe(true);
	});

	const DEVTOOLS_JSON_NEW_ACTIVATE_CLOSE_SCRIPT = `
export default {
	async fetch(request, env) {
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
};
`;

	test(
		"devtools json/new, json/activate, json/close endpoints",
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: DEVTOOLS_JSON_NEW_ACTIVATE_CLOSE_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const { targetType, activateStatus, closeStatus } = (await mf
				.dispatchFetch("https://localhost")
				.then((r) => r.json())) as any;

			expect(targetType).toBe("page");
			expect(activateStatus).toBe(200);
			expect(closeStatus).toBe(200);
		}
	);

	const DEVTOOLS_PAGE_WS_SCRIPT = `
export default {
	async fetch(request, env) {
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
};
`;

	test(
		"devtools page/:target_id WebSocket endpoint",
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: DEVTOOLS_PAGE_WS_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const { resultValue } = (await mf
				.dispatchFetch("https://localhost")
				.then((r) => r.json())) as any;

			expect(resultValue).toBe(2);
		}
	);

	test(
		"DELETE without prior WebSocket connection",
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: `export default {
	async fetch(request, env) {
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
			sessionGone: sessions.length === 0,
		});
	}
};`,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const { deleteStatus, deleteBody, sessionGone } = (await mf
				.dispatchFetch("https://localhost")
				.then((r) => r.json())) as any;

			expect(deleteStatus).toBe(200);
			expect(deleteBody.status).toBe("closed");
			expect(sessionGone).toBe(true);
		}
	);

	const DEVTOOLS_DELETE_ALL_WS_SCRIPT = `
${waitForClosedConnection.toString()}

export default {
	async fetch(request, env) {
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
};
`;

	test(
		"DELETE closes all WebSocket connections (browser + page)",
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: DEVTOOLS_DELETE_ALL_WS_SCRIPT,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const { deleteStatus, deleteBody, browserWsClosed, pageWsClosed } =
				(await mf
					.dispatchFetch("https://localhost")
					.then((r) => r.json())) as any;

			expect(deleteStatus).toBe(200);
			expect(deleteBody.status).toBe("closed");
			expect(browserWsClosed).toBe(true);
			expect(pageWsClosed).toBe(true);
		}
	);

	test(
		"multiple concurrent raw WebSocket connections to same session",
		{ retry: 3 },
		async ({ expect }) => {
			const mf = new Miniflare({
				name: "worker",
				compatibilityDate: "2024-11-20",
				modules: true,
				script: `export default {
	async fetch(request, env) {
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
};`,
				browserRendering: { binding: "MYBROWSER" },
			});
			useDispose(mf);

			const { product1, product2 } = (await mf
				.dispatchFetch("https://localhost")
				.then((r) => r.json())) as any;

			expect(typeof product1).toBe("string");
			expect(product1).toContain("Chrome");
			expect(typeof product2).toBe("string");
			expect(product2).toContain("Chrome");
		}
	);
});
