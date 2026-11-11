import { afterEach, describe, test, vi } from "vitest";
import { ProxyWorker } from "../../../../templates/startDevWorker/ProxyWorker";

function makeProxyWorker() {
	const messages: { type: string }[] = [];
	const env = {
		PROXY_CONTROLLER: {
			fetch: vi.fn(async (_url: string, init: { body: string }) => {
				messages.push(JSON.parse(init.body));
				return new Response(null, { status: 204 });
			}),
		},
		PROXY_CONTROLLER_AUTH_SECRET: "secret",
		DURABLE_OBJECT: {},
	};
	const worker = new ProxyWorker(
		{ getWebSockets: () => [] } as never,
		env as never
	);
	worker.proxyData = {
		userWorkerUrl: { protocol: "http:", hostname: "127.0.0.1", port: "1234" },
		headers: {},
	} as never;
	return { worker, messages };
}

// workerd's Headers has `getAll`, Node's does not
(Headers.prototype as unknown as { getAll: unknown }).getAll ??= function (
	this: Headers
) {
	return this.getSetCookie();
};

describe("ProxyWorker", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// Regression test for https://github.com/cloudflare/workers-sdk/issues/15447
	test("a request whose client disconnected mid-upload is not reported as a fatal ProxyWorker error", async ({
		expect,
	}) => {
		// What workerd does when reading the body of a request whose client has gone away
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError(
					"Can't read from request stream because client disconnected."
				);
			})
		);
		const { worker, messages } = makeProxyWorker();

		const request = new Request("http://localhost:8787/upload", {
			method: "POST",
			body: "some body",
		});
		// Nobody is waiting for the response; whichever way it settles, it must not throw
		await Promise.resolve(worker.fetch(request as never)).catch(() => {});
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(messages.filter((m) => m.type === "error")).toEqual([]);
	});
});
