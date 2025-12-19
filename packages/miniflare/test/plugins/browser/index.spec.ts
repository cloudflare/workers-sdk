import { Miniflare, MiniflareOptions } from "miniflare";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useDispose } from "../../test-shared";
import type { WebSocket } from "undici";

async function sendMessage(ws: WebSocket, message: any) {
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
	// local dev browser rendering relies on a ping message to check browser process status
	const timeoutId = setInterval(() => ws.send("ping"), 500);
	await new Promise((resolve) => ws.addEventListener("close", resolve));
	// clear the interval, no longer need to ping
	if (timeoutId) clearInterval(timeoutId);
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

	test("it creates a browser session", { retry: 3 }, async () => {
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

	test("it closes a browser session", { retry: 3 }, async () => {
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

	test("it reuses a browser session", { retry: 3 }, async () => {
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

		try {
			// try to open new connection for the same session
			const { webSocket: ws2 } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
				headers: { "Upgrade": "websocket" },
			});
		} catch (error) {
			return new Response("Failed to connect to browser session");
		}

		return new Response("Should not reach here");
	}
};
`;

	test.skipIf(process.platform === "win32")(
		"fails if browser session already in use",
		async () => {
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
		async () => {
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
		async () => {
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
});
