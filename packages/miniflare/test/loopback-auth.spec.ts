import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { Response as MiniflareResponse } from "miniflare";
import { describe, vi } from "vitest";
import WebSocket from "ws";
import { CoreHeaders } from "../src/workers/core/constants";
import { disposeWithRetry } from "./test-shared";
import { test } from "./test-shared/control-plane-auth";

async function webSocketStatus(url: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url);
		socket.once("unexpected-response", (_request, response) => {
			response.resume();
			resolve(response.statusCode ?? 0);
			socket.terminate();
		});
		socket.once("error", reject);
		socket.once("open", () => {
			socket.close();
			reject(new Error("Unauthenticated WebSocket upgrade succeeded"));
		});
	});
}

describe("loopback authentication", { concurrent: false }, () => {
	test("rejects a loopback credential from a disposed runtime", async ({
		expect,
		start,
	}) => {
		const first = await start();
		const second = await start();
		expect(first.info.loopbackSecret).not.toBe(second.info.loopbackSecret);
		await disposeWithRetry(first.mf);
		const response = await fetch(
			`${second.info.loopbackUrl}/core/dev-registry`,
			{
				method: "POST",
				headers: { [CoreHeaders.LOOPBACK_SECRET]: first.info.loopbackSecret },
				body: "{}",
			}
		);
		expect(response.status).toBe(403);
		await response.text();
	});

	test("protects loopback discovery, custom services, browser control, and upgrades", async ({
		expect,
		start,
	}) => {
		const fallback = vi.fn(() => new MiniflareResponse("module"));
		const { mf, info } = await start({
			unsafeModuleFallbackService: fallback,
		});
		for (const pathname of [
			"/core/dev-registry",
			"/core/public-url",
			"/browser/sessionIds",
			"/core/do-storage/test/test",
		]) {
			for (const headers of [
				{},
				{
					[CoreHeaders.LOOPBACK_SECRET]: "unknown",
					[CoreHeaders.CUSTOM_NODE_SERVICE]: "0/n/test",
					"X-Resolve-Method": "import",
				},
			]) {
				const response = await fetch(
					`${info.loopbackUrl}${pathname}?specifier=module`,
					{
						headers,
					}
				);
				expect(response.status).toBe(403);
				await response.text();
			}
		}
		expect(fallback).not.toHaveBeenCalled();
		expect(
			await webSocketStatus(
				`${info.loopbackUrl.replace("http:", "ws:")}/core/dev-registry`
			)
		).toBe(403);
		const authorized = await fetch(`${info.loopbackUrl}/core/dev-registry`, {
			headers: { [CoreHeaders.LOOPBACK_SECRET]: info.loopbackSecret },
		});
		expect(authorized.status).toBe(200);
		const metadata = await authorized.text();
		expect(metadata).not.toContain(info.registrySecret);
		expect(metadata).not.toContain(info.loopbackSecret);
		// Exercise legitimate workerd-to-Node loopback traffic as well.
		expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
			"ok"
		);
	});

	// Connects to the loopback server and writes a WebSocket upgrade request
	// without credentials, which is always refused with a 403.
	function refusedUpgradeClient(hostname: string, port: number): net.Socket {
		const client = net.connect(port, hostname, () =>
			client.write(
				`GET /core/dev-registry HTTP/1.1\r\n` +
					`Host: ${hostname}:${port}\r\n` +
					`Upgrade: websocket\r\n` +
					`Connection: Upgrade\r\n` +
					`Sec-WebSocket-Version: 13\r\n` +
					`Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`
			)
		);
		return client;
	}

	test("closes a refused WebSocket upgrade and ignores a peer reset", async ({
		expect,
		start,
	}) => {
		const { info } = await start();
		const url = new URL(info.loopbackUrl);
		const port = Number(url.port);

		// Once Node hands a socket to an "upgrade" listener it is detached
		// from the server: nothing parses another request on it, and the
		// loopback server disables its keep-alive timeout. A refusal that
		// leaves the connection open would linger forever, so the server
		// must close it once the response is written.
		const first = refusedUpgradeClient(url.hostname, port);
		let refused = "";
		const fin = await new Promise<boolean>((resolve) => {
			first.on("data", (chunk: Buffer) => {
				refused += chunk.toString("latin1");
			});
			first.once("end", () => resolve(true));
			sleep(5_000).then(() => resolve(false));
		});
		expect(refused).toMatch(/^HTTP\/1\.1 403 /);
		expect(fin).toBe(true);
		first.end();

		// A peer resetting a refused upgrade must not take the process down:
		// Node removes its own error listener from sockets it hands to an
		// "upgrade" listener, so an unhandled read error here would throw
		// out of the process entirely.
		const unhandled: unknown[] = [];
		const onUncaught = (error: unknown) => unhandled.push(error);
		process.on("uncaughtException", onUncaught);
		try {
			const second = refusedUpgradeClient(url.hostname, port);
			second.once("data", () => second.resetAndDestroy());
			await sleep(500);
			expect(unhandled).toEqual([]);
		} finally {
			process.off("uncaughtException", onUncaught);
		}

		// Legitimate workerd-to-Node loopback traffic is unaffected.
		const authorized = await fetch(`${info.loopbackUrl}/core/dev-registry`, {
			headers: { [CoreHeaders.LOOPBACK_SECRET]: info.loopbackSecret },
		});
		expect(authorized.status).toBe(200);
		await authorized.text();
	});
});
