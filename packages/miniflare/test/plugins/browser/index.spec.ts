import test from "ava";
import { Miniflare, MiniflareOptions } from "miniflare";

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
const HEADER_SIZE = 4; // Uint32

function messageToChunk(data) {
	const encoder = new TextEncoder();
	const encodedUint8Array = encoder.encode(data);

	const chunk = new Uint8Array(HEADER_SIZE + encodedUint8Array.length);
	const view = new DataView(chunk.buffer);
	view.setUint32(0, encodedUint8Array.length, true);
	chunk.set(encodedUint8Array, HEADER_SIZE);
	return chunk;
};

export default {
	async fetch(request, env) {
		const acquireResponse = await env.MYBROWSER.fetch("https://localhost/v1/acquire");
		const { sessionId } = await acquireResponse.json();
		const response = await env.MYBROWSER.fetch(\`https://localhost/v1/connectDevtools?browser_session=\${sessionId}\`, {
			headers: { "Upgrade": "websocket" },
		});
		const ws = response.webSocket;
		ws.accept();
		const closePromise = new Promise(resolve => ws.addEventListener("close", resolve));
		// send a close message to the browser
		const message = JSON.stringify({
			method: "Browser.close",
			id: -1,
			params: {}
		});
		// we need to send the message in chunks
		ws.send(messageToChunk(message));

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
