import { afterAll, afterEach, beforeAll, describe, test } from "vitest";
import { ProxyWorker } from "../../../../templates/startDevWorker/ProxyWorker";
import type { ProxyData } from "../../../api/startDevWorker/events";

/**
 * The ProxyWorker template is a workers-runtime Durable Object; here it runs
 * directly in Node with plain stand-ins for the DurableObjectState and the
 * service bindings, and with the global `fetch` it uses to reach the
 * UserWorker stubbed out.
 */
type ProxyWorkerLike = new (state: unknown, env: unknown) => {
	fetch: (request: Request) => Promise<Response>;
	proxyData?: ProxyData;
};

const USER_WORKER_URL_PARTS = {
	protocol: "http:",
	host: "localhost",
	port: "9999",
};

function makeProxyWorker() {
	const controllerMessages: unknown[] = [];
	const env = {
		PROXY_CONTROLLER: {
			fetch: async (input: unknown, init?: { body?: string }) => {
				if (init?.body) {
					controllerMessages.push(JSON.parse(init.body));
				}
				return new Response(null);
			},
		},
		PROXY_CONTROLLER_AUTH_SECRET: "test-secret",
	};
	const worker = new (ProxyWorker as unknown as ProxyWorkerLike)({}, env);
	worker.proxyData = {
		userWorkerUrl: USER_WORKER_URL_PARTS,
		headers: {},
	};
	return { worker, controllerMessages };
}

describe("ProxyWorker", () => {
	const originalFetch = globalThis.fetch;
	const fetchInputs: unknown[] = [];

	// The template's `rewriteUrlRelatedHeaders` calls the workers-runtime
	// `Headers.prototype.getAll("Set-Cookie")`, which Node's `Headers` lacks.
	// Emulate it for the duration of these tests with `getSetCookie`.
	let getAllImpl: (() => string[]) | undefined;
	beforeAll(() => {
		const prototype = Headers.prototype as typeof Headers.prototype & {
			getAll?: (name: string) => string[];
		};
		getAllImpl = prototype.getAll;
		prototype.getAll = function (name: string): string[] {
			if (name.toLowerCase() === "set-cookie") {
				return this.getSetCookie();
			}
			const value = this.get(name);
			return value === null ? [] : [value];
		};
	});
	afterAll(() => {
		if (getAllImpl) {
			(
				Headers.prototype as typeof Headers.prototype & {
					getAll: (name: string) => string[];
				}
			).getAll = getAllImpl;
		} else {
			delete (Headers.prototype as unknown as { getAll?: unknown }).getAll;
		}
	});

	function stubInnerFetch(
		behavior: (attempt: number) => Promise<Response>
	): void {
		fetchInputs.length = 0;
		globalThis.fetch = (async (input: unknown) => {
			const attempt = fetchInputs.length;
			fetchInputs.push(input);
			return behavior(attempt);
		}) as typeof fetch;
	}

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("processQueue", () => {
		test("forwards a POST to the UserWorker and resolves its response", async ({
			expect,
		}) => {
			const { worker, controllerMessages } = makeProxyWorker();
			stubInnerFetch(() =>
				Promise.resolve(new Response("user worker says ok"))
			);

			const request = new Request("http://localhost:8787/api/thing", {
				method: "POST",
				body: JSON.stringify({ hello: "world" }),
				headers: { "content-type": "application/json" },
			});
			const response = await worker.fetch(request);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("user worker says ok");
			expect(fetchInputs).toHaveLength(1);
			expect(controllerMessages).toEqual([]);
		});

		test("retries a GET whose inner connection is dropped before any response", async ({
			expect,
		}) => {
			const { worker, controllerMessages } = makeProxyWorker();
			stubInnerFetch((attempt) =>
				attempt === 0
					? Promise.reject(new Error("Network connection lost."))
					: Promise.resolve(new Response("user worker says ok"))
			);

			const request = new Request("http://localhost:8787/api/thing", {
				method: "GET",
			});
			const response = await worker.fetch(request);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("user worker says ok");
			expect(fetchInputs).toHaveLength(2);
			expect(controllerMessages).toEqual([]);
		});

		test("retries a POST with a small body whose inner connection is dropped before any response (#14641)", async ({
			expect,
		}) => {
			const { worker, controllerMessages } = makeProxyWorker();
			stubInnerFetch((attempt) =>
				attempt === 0
					? Promise.reject(new Error("Network connection lost."))
					: Promise.resolve(new Response("user worker says ok"))
			);

			const request = new Request("http://localhost:8787/api/thing", {
				method: "POST",
				body: JSON.stringify({ hello: "world" }),
				headers: {
					"content-type": "application/json",
					"content-length": "18",
				},
			});
			const response = await worker.fetch(request);

			// The UserWorker never saw the first attempt (the connection was
			// closed before it was read — the kj 5s keep-alive race), so the
			// request should be replayed on a fresh connection and succeed,
			// rather than failing the request and reporting
			// "Network connection lost" / "worker restarted mid-request".
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("user worker says ok");
			expect(fetchInputs).toHaveLength(2);
			expect(controllerMessages).toEqual([]);
		});
	});
});
