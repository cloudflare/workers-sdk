import net from "node:net";
import { describe } from "vitest";
import { test } from "./test-shared/control-plane-auth";

describe("loopback upgrade socket errors", { concurrent: false }, () => {
	test("a peer reset after a refused upgrade does not crash the process", async ({
		expect,
		start,
	}) => {
		const { info } = await start();
		const { hostname, port } = new URL(info.loopbackUrl);

		const uncaught: Error[] = [];
		const listeners = process.listeners("uncaughtException");
		process.removeAllListeners("uncaughtException");
		process.on("uncaughtException", (error) => uncaught.push(error));
		try {
			await new Promise<void>((resolve, reject) => {
				const client = net.connect(Number(port), hostname, () => {
					client.write(
						"GET /core/dev-registry HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
					);
				});
				client.once("error", reject);
				client.once("data", (data) => {
					expect(data.toString()).toMatch(/^HTTP\/1\.1 403/);
					client.resetAndDestroy();
					resolve();
				});
			});
			// Give the server time to observe the reset
			await new Promise((resolve) => setTimeout(resolve, 500));
			expect(uncaught.map((e) => e.message)).toEqual([]);
		} finally {
			process.removeAllListeners("uncaughtException");
			for (const l of listeners) process.on("uncaughtException", l);
		}
	});
});
