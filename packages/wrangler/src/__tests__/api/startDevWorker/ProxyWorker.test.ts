import { describe, test, vi } from "vitest";
import { ProxyWorker } from "../../../../templates/startDevWorker/ProxyWorker";
import type { ProxyData } from "../../../api/startDevWorker/events";
import { mockConsoleMethods } from "../../helpers/mock-console";

// The ProxyWorker template runs inside workerd, whose `Headers` has a
// `getAll()` method. Node's `Headers` (undici) does not, so polyfill it here
// to let the template's header rewriting run unchanged under vitest.
if (!("getAll" in Headers.prototype)) {
	Object.defineProperty(Headers.prototype, "getAll", {
		value: function getAll(this: Headers, name: string): string[] {
			if (name.toLowerCase() === "set-cookie") {
				return this.getSetCookie();
			}
			const value = this.get(name);
			return value === null ? [] : [value];
		},
		configurable: true,
		writable: true,
	});
}

type ProxyWorkerEnv = ConstructorParameters<typeof ProxyWorker>[1];
type ProxyWorkerState = ConstructorParameters<typeof ProxyWorker>[0];

const proxyData: ProxyData = {
	userWorkerUrl: { protocol: "http:", hostname: "userworker", port: "8787" },
	headers: {},
};

function makeProxyWorker() {
	const controllerMessages: { type: string; error?: unknown }[] = [];
	const state = {
		acceptWebSocket: vi.fn(),
		getWebSockets: () => [],
	} as unknown as ProxyWorkerState;
	const env = {
		PROXY_CONTROLLER_AUTH_SECRET: "test-secret",
		PROXY_CONTROLLER: {
			fetch: async (_url: string, init: RequestInit) => {
				controllerMessages.push(JSON.parse(String(init.body)));
				return new Response(null);
			},
		},
		DURABLE_OBJECT: {},
	} as unknown as ProxyWorkerEnv;
	const proxyWorker = new ProxyWorker(state, env);
	return { proxyWorker, controllerMessages };
}

/**
 * Stubs the inner `fetch` to the UserWorker so the first attempt rejects with
 * kj's `DISCONNECTED` message — what a request sees when the UserWorker's HTTP
 * server closes a reused keep-alive connection at the exact moment the request
 * is written to it (kj's client pool `idleTimeout` and server
 * `pipelineTimeout` both default to 5s, so a connection idling ~5s races the
 * close) — while the next attempt, on a fresh connection, succeeds.
 */
function stubDroppedThenRecoveredInnerFetch() {
	const calls: unknown[][] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (...args: unknown[]) => {
			calls.push(args);
			if (calls.length === 1) {
				throw new Error("Network connection lost.");
			}
			return new Response("ok");
		})
	);
	return calls;
}

describe("ProxyWorker retry on a dropped connection to the UserWorker", () => {
	mockConsoleMethods();

	test("recovers a GET that meets a dropped connection", async ({ expect }) => {
		const { proxyWorker, controllerMessages } = makeProxyWorker();
		proxyWorker.proxyData = proxyData;
		const calls = stubDroppedThenRecoveredInnerFetch();

		const response = await proxyWorker.fetch(
			new Request("http://127.0.0.1:8787/path", { method: "GET" })
		);

		expect(calls.length).toBe(2);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(controllerMessages).toEqual([]);
	});

	test("recovers a POST that meets a dropped connection instead of dropping it", async ({
		expect,
	}) => {
		// Regression test for
		// https://github.com/cloudflare/workers-sdk/issues/14641: a non-GET
		// request whose fetch to the UserWorker rejects with a
		// connection-level failure (the reused keep-alive connection was
		// closed before any response byte was received) currently fails and is
		// reported to the ProxyController, even though the UserWorker never
		// restarted and a retry on a fresh connection succeeds.
		const { proxyWorker, controllerMessages } = makeProxyWorker();
		proxyWorker.proxyData = proxyData;
		const calls = stubDroppedThenRecoveredInnerFetch();

		const response = await proxyWorker.fetch(
			new Request("http://127.0.0.1:8787/path", {
				method: "POST",
				body: JSON.stringify({ hello: "world" }),
				headers: { "content-type": "application/json" },
			})
		);

		expect(calls.length).toBe(2);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
		expect(controllerMessages).toEqual([]);
	});
});
