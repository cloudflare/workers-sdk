import assert from "node:assert";
import nodeNet from "node:net";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

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
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "module.ts"),
			{
				config: path.resolve(__dirname, "..", "wrangler.module.toml"),
				port: await getPort(),
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			}
		);
	});

	afterAll(async () => {
		await worker?.stop();
	});

	it("fetches worker", async () => {
		const resp = await worker.fetch("/");
		expect(resp.status).toBe(200);
	});
});
