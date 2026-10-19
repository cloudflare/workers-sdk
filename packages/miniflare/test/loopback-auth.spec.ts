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

describe.sequential("loopback authentication", () => {
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
});
