import nodeNet from "node:net";
import path from "path";
import { afterAll, assert, beforeAll, describe, it } from "vitest";
import { unstable_startWorker } from "wrangler";

function getPort() {
	return new Promise<number>((resolve, reject) => {
		const server = nodeNet.createServer((socket) => socket.destroy());
		server.listen(0, () => {
			const address = server.address();
			assert(typeof address === "object" && address !== null);
			server.close((err) => {
				if (err) reject(err);
				else resolve(address.port);
			});
		});
	});
}

describe("specific port", () => {
	let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

	beforeAll(async () => {
		worker = await unstable_startWorker({
			entrypoint: path.resolve(__dirname, "../src/module.ts"),
			config: path.resolve(__dirname, "../wrangler.module.jsonc"),
			dev: {
				server: { hostname: "127.0.0.1", port: await getPort() },
				inspector: false,
			},
		});
	});

	afterAll(async () => {
		await worker?.dispose();
	});

	it("fetches worker", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/");
		expect(resp.status).toBe(200);
	});
});
