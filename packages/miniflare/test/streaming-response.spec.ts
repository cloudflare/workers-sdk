import http from "node:http";
import { Miniflare } from "miniflare";
import { onTestFinished, test } from "vitest";
import { singleModuleManifest, useDispose } from "./test-shared";
import type { AddressInfo } from "node:net";

// Worker that enqueues `chunk1;` immediately, then holds the stream open
// (via a fetch to a gate server the test only releases explicitly) before
// enqueuing `chunk2` and closing. A streaming transport must deliver the
// first chunk before the gate is released.
const streamingWorkerScript = `
export default {
	fetch(request, env, ctx) {
		const body = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();
				controller.enqueue(encoder.encode("chunk1;"));
				ctx.waitUntil((async () => {
					await fetch(env.GATE_URL);
					controller.enqueue(encoder.encode("chunk2"));
					controller.close();
				})());
			},
		});
		return new Response(body, {
			headers: { "content-type": "text/plain" },
		});
	},
};
`;

interface ReadChunk {
	done: boolean;
	value?: Uint8Array;
}

interface GateServer {
	url: string;
	release(): void;
}

async function startGateServer(): Promise<GateServer> {
	let releaseGate: () => void = () => {};
	const gate = new Promise<void>((resolve) => (releaseGate = resolve));
	const server = http.createServer(async (_req, res) => {
		await gate;
		res.end("released");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	onTestFinished(
		() =>
			new Promise<void>((resolve, reject) =>
				server.close((err) => (err ? reject(err) : resolve()))
			)
	);
	const port = (server.address() as AddressInfo).port;
	return { url: `http://127.0.0.1:${port}/`, release: releaseGate };
}

async function assertStreamedIncrementally(
	response: { body: unknown },
	gate: GateServer,
	expect: (typeof import("vitest"))["expect"]
): Promise<void> {
	const decoder = new TextDecoder();
	const stream = response.body as ReadableStream | null;
	if (stream === null) {
		throw new Error("expected response body stream");
	}
	const reader = stream.getReader();
	// Single in-flight read, so no chunk is lost when draining below
	const pendingFirst: Promise<ReadChunk> = reader.read();
	let first: ReadChunk | null = null;
	try {
		first = await Promise.race([
			pendingFirst,
			new Promise<null>((resolve) => {
				setTimeout(() => resolve(null), 5000);
			}),
		]);
	} finally {
		gate.release();
	}

	// Whatever the chunk timing, drain and check the full body is delivered
	let body = decoder.decode(
		(first ?? (await pendingFirst)).value ?? new Uint8Array()
	);
	let read = await reader.read();
	while (!read.done) {
		body += decoder.decode(read.value);
		read = await reader.read();
	}
	expect(body).toBe("chunk1;chunk2");

	// The first chunk must have been delivered while the gate was still held,
	// rather than everything arriving at once once the stream closed.
	expect(first).not.toBeNull();
	if (first !== null) {
		expect(decoder.decode(first.value)).toBe("chunk1;");
	}
}

test("Miniflare: dispatchFetch() streams response chunks as they are enqueued", async ({
	expect,
}) => {
	const gate = await startGateServer();
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(streamingWorkerScript),
					env: { GATE_URL: { type: "text", value: gate.url } },
				},
			},
		],
	});
	useDispose(mf);

	// No `Accept-Encoding` is set, so undici's default (gzip) applies, as it
	// does for `dispatchFetch()` callers such as the Vitest integration.
	const response = await mf.dispatchFetch("http://placeholder/stream");
	await assertStreamedIncrementally(response, gate, expect);
});

test("Miniflare: HTTP server streams gzip responses as they are enqueued", async ({
	expect,
}) => {
	const gate = await startGateServer();
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(streamingWorkerScript),
					env: { GATE_URL: { type: "text", value: gate.url } },
				},
			},
		],
	});
	useDispose(mf);

	const url = await mf.ready;
	const response = await fetch(url, {
		headers: { "accept-encoding": "gzip" },
	});
	await assertStreamedIncrementally(response, gate, expect);
});
