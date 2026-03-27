import { describe, expect, test, vi } from "vitest";
import {
	fetchThroughViteProxyWorker,
	isWebSocketUpgrade,
} from "../workers/vite-proxy-worker/fetch";

describe("ViteProxyWorker", () => {
	test("routes websocket upgrades to the entry worker", async () => {
		const entryResponse = new Response("entry worker");
		const entryFetch = vi.fn().mockResolvedValue(entryResponse);
		const middlewareFetch = vi.fn();
		const request = new Request("https://example.com/socket", {
			headers: { Upgrade: "websocket" },
		});

		const response = await fetchThroughViteProxyWorker(request, {
			ENTRY_USER_WORKER: { fetch: entryFetch },
			__VITE_MIDDLEWARE__: { fetch: middlewareFetch },
		});

		expect(response).toBe(entryResponse);
		expect(entryFetch).toHaveBeenCalledOnce();
		expect(entryFetch).toHaveBeenCalledWith(request);
		expect(middlewareFetch).not.toHaveBeenCalled();
	});

	test("routes non-upgrade requests through vite middleware", async () => {
		const entryFetch = vi.fn();
		const middlewareResponse = new Response("ok");
		const middlewareFetch = vi.fn().mockResolvedValue(middlewareResponse);
		const request = new Request("https://example.com/");

		const response = await fetchThroughViteProxyWorker(request, {
			ENTRY_USER_WORKER: { fetch: entryFetch },
			__VITE_MIDDLEWARE__: { fetch: middlewareFetch },
		});

		expect(response).toBe(middlewareResponse);
		expect(middlewareFetch).toHaveBeenCalledOnce();
		expect(middlewareFetch).toHaveBeenCalledWith(request);
		expect(entryFetch).not.toHaveBeenCalled();
	});

	test("treats the upgrade header as case-insensitive", () => {
		const request = new Request("https://example.com/socket", {
			headers: { upgrade: "WebSocket" },
		});

		expect(isWebSocketUpgrade(request)).toBe(true);
	});
});
