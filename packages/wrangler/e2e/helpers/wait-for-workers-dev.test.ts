import assert from "node:assert";
import { createServer } from "node:http";
import { afterEach, it } from "vitest";
import { waitForWorkersDev } from "./wait-for-workers-dev";
import type { RequestListener, Server } from "node:http";

let server: Server | undefined;

afterEach(async () => {
	if (server) {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => {
			server?.close((error) => (error ? reject(error) : resolve()));
		});
		server = undefined;
	}
});

it("retries workers.dev 404 responses", async ({ expect }) => {
	let requestCount = 0;
	const url = await listen((_request, response) => {
		requestCount++;
		response.writeHead(requestCount === 1 ? 404 : 200).end();
	});

	const response = await waitForWorkersDev(url);

	expect(response.status).toBe(200);
	expect(requestCount).toBe(2);
});

it("returns non-404 application failures without retrying", async ({
	expect,
}) => {
	let requestCount = 0;
	const url = await listen((_request, response) => {
		requestCount++;
		response.writeHead(500).end();
	});

	const response = await waitForWorkersDev(url);

	expect(response.status).toBe(500);
	expect(requestCount).toBe(1);
});

async function listen(handler: RequestListener): Promise<string> {
	server = createServer(handler);
	await new Promise<void>((resolve, reject) => {
		server?.once("error", reject);
		server?.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	assert(address && typeof address !== "string");
	return `http://127.0.0.1:${address.port}`;
}
