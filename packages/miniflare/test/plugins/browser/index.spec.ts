import test from "ava";
import { Miniflare, MiniflareOptions } from "miniflare";
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

// we need to run browser rendering tests in a serial manner to avoid a race condition installing the browser
test.serial("it creates a browser session", async (t) => {
	const opts: MiniflareOptions = {
		name: "worker",
		compatibilityDate: "2024-11-20",
		modules: true,
		script: BROWSER_WORKER_SCRIPT(),
		browserRendering: { binding: "MYBROWSER" },
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://localhost/session");
	t.assert((await res.text()).includes("sessionId"));
});

const BROWSER_WORKER_CLOSE_SCRIPT = `
${sendMessage.toString()}

export default {
	async fetch(request, env) {
		const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
		const { sessionId } = await acquireResponse.json();
		const { webSocket: ws } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		ws.accept();

		const closePromise = new Promise(resolve => ws.addEventListener("close", resolve));
		// send a close message to the browser
		sendMessage(ws, { method: "Browser.close", id: -1 });

		const timeoutId = setInterval(() => {
			// local dev browser rendering relies on a ping message to check browser process status
			ws.send("ping");
		}, 1000);
		await closePromise;
		// clear the interval, no longer need to ping
		clearInterval(timeoutId);
		return new Response("Browser closed");
	}
};
`;

test.serial("it closes a browser session", async (t) => {
	const opts: MiniflareOptions = {
		name: "worker",
		compatibilityDate: "2024-11-20",
		modules: true,
		script: BROWSER_WORKER_CLOSE_SCRIPT,
		browserRendering: { binding: "MYBROWSER" },
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://localhost/close");
	t.is(await res.text(), "Browser closed");
});

const BROWSER_WORKER_REUSE_SCRIPT = `
${sendMessage.toString()}

export default {
	async fetch(request, env) {
		const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
		const { sessionId } = await acquireResponse.json();
		const { webSocket: ws } = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		ws.accept();
		ws.close();

		// wait a bit to ensure webSocket readyState is updated on BrowserSession
		await new Promise(resolve => setTimeout(resolve, 100));

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

test.serial("it reuses a browser session", async (t) => {
	const opts: MiniflareOptions = {
		name: "worker",
		compatibilityDate: "2024-11-20",
		modules: true,
		script: BROWSER_WORKER_REUSE_SCRIPT,
		browserRendering: { binding: "MYBROWSER" },
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://localhost");
	t.is(await res.text(), "Browser session reused");
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

const isWindows = process.platform === "win32";
(isWindows ? test.skip : test.serial)(
	"fails if browser session already in use",
	async (t) => {
		const opts: MiniflareOptions = {
			name: "worker",
			compatibilityDate: "2024-11-20",
			modules: true,
			script: BROWSER_WORKER_ALREADY_USED_SCRIPT,
			browserRendering: { binding: "MYBROWSER" },
		};
		const mf = new Miniflare(opts);
		t.teardown(() => mf.dispose());

		const res = await mf.dispatchFetch("https://localhost");
		t.is(await res.text(), "Failed to connect to browser session");
	}
);
