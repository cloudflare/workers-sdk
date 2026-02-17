import nodeNet from "node:net";
import path from "path";
import { afterAll, assert, beforeAll, describe, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { Unstable_DevWorker } from "wrangler";

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
	let worker: Unstable_DevWorker;

	beforeAll(async () => {
		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "module.ts"),
			{
				config: path.resolve(__dirname, "..", "wrangler.module.jsonc"),
				port: await getPort(),
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					devEnv: true,
				},
			}
		);
	});

	afterAll(async () => {
		await worker?.stop();
	});

	it("fetches worker", async ({ expect }) => {
		const resp = await worker.fetch("/");
		expect(resp.status).toBe(200);
	});
});
