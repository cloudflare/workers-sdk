import assert from "node:assert";
import events from "node:events";
import timers from "node:timers/promises";
import getPort from "get-port";
import { Log, Miniflare } from "miniflare";
import * as undici from "undici";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { unstable_DevEnv as DevEnv } from "wrangler";
import { WebSocket } from "ws";
import type {
	MiniflareOptions,
	Response as MiniflareResponse,
} from "miniflare";
import type { ProxyData } from "wrangler/src/api";
import type { StartDevWorkerOptions } from "wrangler/src/api/startDevWorker/types";
import type { EsbuildBundle } from "wrangler/src/dev/use-esbuild";

const fakeBundle = {} as EsbuildBundle;

let devEnv: DevEnv;
let mf: Miniflare | undefined;
let res: MiniflareResponse | undici.Response;
let ws: WebSocket | undefined;
let fireAndForgetPromises: Promise<any>[] = [];

type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

beforeEach(() => {
	devEnv = new DevEnv();
	mf = undefined;
	res = undefined as any;
	ws = undefined;
});
afterEach(async () => {
	await Promise.allSettled(fireAndForgetPromises);
	await devEnv?.teardown();
	await mf?.dispose();
	await ws?.close();

	vi.resetAllMocks();
});

async function fakeStartUserWorker(options: {
	script: string;
	name?: string;
	mfOpts?: Partial<MiniflareOptions>;
	config?: OptionalKeys<StartDevWorkerOptions, "name" | "script">;
}) {
	const config: StartDevWorkerOptions = {
		...options.config,
		name: options.name ?? "test-worker",
		script: { contents: options.script },
	};
	const mfOpts: MiniflareOptions = Object.assign(
		{
			port: undefined,
			inspectorPort: 0,
			modules: true,
			compatibilityDate: "2023-08-01",
			name: config.name,
			script: options.script,
		},
		options.mfOpts
	);

	assert("script" in mfOpts);

	fakeConfigUpdate(config);
	fakeReloadStart(config);

	const worker = devEnv.startWorker(config);
	const { proxyWorker } = await devEnv.proxy.ready.promise;
	const proxyWorkerUrl = await proxyWorker.ready;
	const inspectorProxyWorkerUrl = await proxyWorker.unsafeGetDirectURL(
		"InspectorProxyWorker"
	);

	mf = new Miniflare(mfOpts);

	const userWorkerUrl = await mf.ready;
	const userWorkerInspectorUrl = await mf.getInspectorURL();
	fakeReloadComplete(config, mfOpts, userWorkerUrl, userWorkerInspectorUrl);

	return {
		worker,
		mf,
		mfOpts,
		config,
		userWorkerUrl,
		userWorkerInspectorUrl,
		proxyWorkerUrl,
		inspectorProxyWorkerUrl,
	};
}

async function fakeUserWorkerChanges({
	script,
	mfOpts,
	config,
}: {
	script?: string;
	mfOpts: MiniflareOptions;
	config: StartDevWorkerOptions;
}) {
	assert(mf);
	assert("script" in mfOpts);

	config = {
		...config,
		script: {
			...config.script,
			...(script ? { contents: script } : undefined),
		},
	};
	mfOpts = {
		...mfOpts,
		script: script ?? mfOpts.script,
	};

	fakeReloadStart(config);

	await mf.setOptions(mfOpts);

	const userWorkerUrl = await mf.ready;
	const userWorkerInspectorUrl = await mf.getInspectorURL();
	fakeReloadComplete(
		config,
		mfOpts,
		userWorkerUrl,
		userWorkerInspectorUrl,
		1000
	);

	return { mfOpts, config, mf, userWorkerUrl, userWorkerInspectorUrl };
}

function fireAndForgetFakeUserWorkerChanges(
	...args: Parameters<typeof fakeUserWorkerChanges>
) {
	// fire and forget the reload -- this let's us test request buffering
	const promise = fakeUserWorkerChanges(...args);
	fireAndForgetPromises.push(promise);
}

function fakeConfigUpdate(config: StartDevWorkerOptions) {
	devEnv.proxy.onConfigUpdate({
		type: "configUpdate",
		config,
	});

	return config; // convenience to allow calling and defining new config inline but also store the new object
}
function fakeReloadStart(config: StartDevWorkerOptions) {
	devEnv.proxy.onReloadStart({
		type: "reloadStart",
		config,
		bundle: fakeBundle,
	});

	return config;
}
function fakeReloadComplete(
	config: StartDevWorkerOptions,
	mfOpts: MiniflareOptions,
	userWorkerUrl: URL,
	userWorkerInspectorUrl: URL,
	delay = 100
) {
	const proxyData: ProxyData = {
		userWorkerUrl: {
			protocol: userWorkerUrl.protocol,
			hostname: userWorkerUrl.hostname,
			port: userWorkerUrl.port,
		},
		userWorkerInspectorUrl: {
			protocol: userWorkerInspectorUrl.protocol,
			hostname: userWorkerInspectorUrl.hostname,
			port: userWorkerInspectorUrl.port,
			pathname: `/core:user:${config.name}`,
		},
		userWorkerInnerUrlOverrides: {
			protocol: config?.dev?.urlOverrides?.secure ? "https:" : "http:",
			hostname: config?.dev?.urlOverrides?.hostname,
		},
		headers: {},
		liveReload: config.dev?.liveReload,
	};

	const timeoutPromise = timers.setTimeout(delay).then(() => {
		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: fakeBundle,
			proxyData,
		});
	});
	// Add this promise to `fireAndForgetPromises`, ensuring it runs before we
	// start the next test
	fireAndForgetPromises.push(timeoutPromise);

	return { config, mfOpts }; // convenience to allow calling and defining new config/mfOpts inline but also store the new objects
}

function waitForMessageContaining<T>(ws: WebSocket, value: string): Promise<T> {
	return new Promise((resolve) => {
		ws.addEventListener("message", (event) => {
			assert(typeof event.data === "string");
			if (event.data.includes(value)) {
				resolve(JSON.parse(event.data));
			}
		});
	});
}

describe("startDevWorker: ProxyController", () => {
	test("ProxyWorker buffers requests while runtime reloads", async () => {
		const run = await fakeStartUserWorker({
			script: `
				export default {
					fetch() {
						return new Response("body:1");
					}
				}
			`,
		});

		res = await run.worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:1");

		fireAndForgetFakeUserWorkerChanges({
			mfOpts: run.mfOpts,
			config: run.config,
			script: run.mfOpts.script.replace("body:1", "body:2"),
		});

		res = await run.worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:2");
	});

	test("InspectorProxyWorker discovery endpoints + devtools websocket connection", async () => {
		const run = await fakeStartUserWorker({
			script: `
				export default {
					fetch() {
						console.log('Inside mock user worker');

						return new Response("body:1");
					}
				}
			`,
		});

		await devEnv.proxy.ready;
		res = await undici.fetch(`http://${run.inspectorProxyWorkerUrl.host}/json`);

		await expect(res.json()).resolves.toBeInstanceOf(Array);

		ws = new WebSocket(
			`ws://${run.inspectorProxyWorkerUrl.host}/core:user:${run.config.name}`
		);
		const openPromise = events.once(ws, "open");

		const consoleAPICalledPromise = waitForMessageContaining(
			ws,
			"Runtime.consoleAPICalled"
		);
		const executionContextCreatedPromise = waitForMessageContaining(
			ws,
			"Runtime.executionContextCreated"
		);

		await openPromise;
		await run.worker.fetch("http://localhost");

		await expect(consoleAPICalledPromise).resolves.toMatchObject({
			method: "Runtime.consoleAPICalled",
			params: {
				args: expect.arrayContaining([
					{ type: "string", value: "Inside mock user worker" },
				]),
			},
		});
		await expect(executionContextCreatedPromise).resolves.toMatchObject({
			method: "Runtime.executionContextCreated",
			params: {
				context: { id: expect.any(Number) },
			},
		});

		// Ensure execution contexts cleared on reload
		const executionContextClearedPromise = waitForMessageContaining(
			ws,
			"Runtime.executionContextsCleared"
		);
		fireAndForgetFakeUserWorkerChanges({
			mfOpts: run.mfOpts,
			config: run.config,
			script: run.mfOpts.script.replace("body:1", "body:2"),
		});
		await executionContextClearedPromise;
	});

	test("InspectorProxyWorker rejects unauthorised requests", async () => {
		const run = await fakeStartUserWorker({
			script: `
				export default {
					fetch() {
						return new Response();
					}
				}
			`,
		});

		// Check validates `Host` header
		ws = new WebSocket(
			`ws://${run.inspectorProxyWorkerUrl.host}/core:user:${run.config.name}`,
			{ setHost: false, headers: { Host: "example.com" } }
		);
		let openPromise = events.once(ws, "open");
		await expect(openPromise).rejects.toThrow("Unexpected server response");

		// Check validates `Origin` header
		ws = new WebSocket(
			`ws://${run.inspectorProxyWorkerUrl.host}/core:user:${run.config.name}`,
			{ origin: "https://example.com" }
		);
		openPromise = events.once(ws, "open");
		await expect(openPromise).rejects.toThrow("Unexpected server response");
		ws.close();
	});

	test("User worker exception", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error");

		const run = await fakeStartUserWorker({
			script: `
					export default {
						fetch() {
							throw new Error('Boom!');

							return new Response("body:1");
						}
					}
				`,
		});

		res = await run.worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("Error: Boom!");

		await new Promise((r) => setTimeout(r, 100)); // allow some time for the error to be logged (TODO: replace with retry/waitUntil helper)
		expect(consoleErrorSpy).toBeCalledWith(
			expect.stringContaining("Error: Boom!")
		);

		// test changes causing a new error cause the new error to propogate
		fireAndForgetFakeUserWorkerChanges({
			script: `
					export default {
						fetch() {
							throw new Error('Boom 2!');

							return new Response("body:2");
						}
					}
				`,
			mfOpts: run.mfOpts,
			config: run.config,
		});

		res = await run.worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("Error: Boom 2!");

		await new Promise((r) => setTimeout(r, 100)); // allow some time for the error to be logged (TODO: replace with retry/waitUntil helper)
		expect(consoleErrorSpy).toBeCalledWith(
			expect.stringContaining("Error: Boom 2!")
		);

		// test eyeball requests receive the pretty error page
		fireAndForgetFakeUserWorkerChanges({
			script: `
					export default {
						fetch() {
							const e = new Error('Boom 3!');

							// this is how errors are serialised after they are caught by wrangler/miniflare3 middlewares
							const error = { name: e.name, message: e.message, stack: e.stack };
							return Response.json(error, {
								status: 500,
								headers: { "MF-Experimental-Error-Stack": "true" },
							});
						}
					}
				`,
			mfOpts: run.mfOpts,
			config: run.config,
		});

		const proxyWorkerUrl = await devEnv.proxy.proxyWorker?.ready;
		assert(proxyWorkerUrl);
		res = await undici.fetch(proxyWorkerUrl, {
			headers: { Accept: "text/html" },
		});
		await expect(res.text()).resolves.toEqual(
			expect.stringContaining(`<h2 class="error-message"> Boom 3! </h2>`) // pretty error page html snippet
		);

		// test further changes that fix the code
		fireAndForgetFakeUserWorkerChanges({
			script: `
					export default {
						fetch() {
							return new Response("body:3");
						}
					}
				`,
			mfOpts: run.mfOpts,
			config: run.config,
		});

		res = await run.worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:3");

		consoleErrorSpy.mockReset();
		res = await run.worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:3");

		await new Promise((r) => setTimeout(r, 100)); // allow some time for the error to be logged (TODO: replace with retry/waitUntil helper)
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	test("config.dev.{server,inspector} changes, restart the server instance", async () => {
		const run = await fakeStartUserWorker({
			script: `
				export default {
					fetch() {
						return new Response("body:1");
					}
				}
			`,
			config: {
				dev: {
					server: { port: await getPort() },
					inspector: { port: await getPort() },
				},
			},
		});

		res = await run.worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:1");

		const oldPort = run.config.dev?.server?.port;
		res = await undici.fetch(`http://127.0.0.1:${oldPort}`);
		await expect(res.text()).resolves.toBe("body:1");

		const config2 = fakeConfigUpdate({
			...run.config,
			dev: {
				server: { port: await getPort() },
				inspector: { port: await getPort() },
			},
		});
		fakeReloadStart(config2);
		fakeReloadComplete(
			config2,
			run.mfOpts,
			run.userWorkerUrl,
			run.userWorkerInspectorUrl
		);

		const newPort = config2.dev?.server?.port;

		res = await run.worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:1");

		res = await undici.fetch(`http://127.0.0.1:${newPort}`);
		await expect(res.text()).resolves.toBe("body:1");

		await expect(
			undici.fetch(`http://127.0.0.1:${oldPort}`).then((r) => r.text())
		).rejects.toMatchInlineSnapshot("[TypeError: fetch failed]");
	});

	test("liveReload", async () => {
		let resText: string;
		const scriptRegex = /<script>([\s\S]*)<\/script>/gm;

		const run = await fakeStartUserWorker({
			script: `
				export default {
					fetch() {
						return new Response("body:1", {
							headers: { 'Content-Type': 'text/html' }
						});
					}
				}
			`,
			config: {
				dev: { liveReload: true },
			},
		});

		// test liveReload: true inserts live-reload <script> tag when the response Content-Type is html
		res = await run.worker.fetch("http://dummy");
		resText = await res.text();
		expect(resText).toEqual(expect.stringContaining("body:1"));
		expect(resText).toEqual(expect.stringMatching(scriptRegex));
		expect(resText.replace(scriptRegex, "").trim()).toEqual("body:1"); // test, without the <script> tag, the response is as authored

		fireAndForgetFakeUserWorkerChanges({
			mfOpts: run.mfOpts,
			script: `
				export default {
					fetch() {
						return new Response("body:2");
					}
				}
			`,
			config: {
				...run.config,
				dev: { liveReload: true },
			},
		});

		// test liveReload does nothing when the response Content-Type is not html
		res = await run.worker.fetch("http://dummy");
		resText = await res.text();
		expect(resText).toMatchInlineSnapshot('"body:2"');
		expect(resText).toBe("body:2");
		expect(resText).not.toEqual(expect.stringMatching(scriptRegex));

		fireAndForgetFakeUserWorkerChanges({
			mfOpts: run.mfOpts,
			script: `
				export default {
					fetch() {
						return new Response("body:3", {
							headers: { 'Content-Type': 'text/html' }
						});
					}
				}
			`,
			config: {
				...run.config,
				dev: { liveReload: false },
			},
		});

		// test liveReload: false does nothing even when the response Content-Type is html
		res = await run.worker.fetch("http://dummy");
		resText = await res.text();
		expect(resText).toMatchInlineSnapshot('"body:3"');
		expect(resText).toBe("body:3");
		expect(resText).not.toEqual(expect.stringMatching(scriptRegex));
	});

	test("urlOverrides take effect in the UserWorker", async () => {
		const run = await fakeStartUserWorker({
			script: `
				export default {
					fetch(request) {
						return new Response("URL: " + request.url);
					}
				}
			`,
			config: {
				dev: {
					urlOverrides: {
						hostname: "www.google.com",
					},
				},
			},
		});

		res = await run.worker.fetch("http://dummy/test/path/1");
		await expect(res.text()).resolves.toBe(
			`URL: http://www.google.com/test/path/1`
		);

		const config2 = fakeConfigUpdate({
			...run.config,
			dev: {
				...run.config.dev,
				urlOverrides: {
					secure: true,
					hostname: "mybank.co.uk",
				},
			},
		});
		fakeReloadComplete(
			config2,
			run.mfOpts,
			run.userWorkerUrl,
			run.userWorkerInspectorUrl,
			1000
		);

		res = await run.worker.fetch("http://dummy/test/path/2");
		await expect(res.text()).resolves.toBe(
			"URL: https://mybank.co.uk/test/path/2"
		);
	});

	test("inflight requests are retried during UserWorker reloads", async () => {
		// to simulate inflight requests failing during UserWorker reloads,
		// we will use a UserWorker with a longish `await setTimeout(...)`
		// so that we can guarantee the race condition is hit
		// when workerd is eventually terminated

		const run = await fakeStartUserWorker({
			script: `
				export default {
					async fetch(request) {
            const url = new URL(request.url);

            if (url.pathname === '/long') {
              await new Promise(r => setTimeout(r, 30_000));
            }
						return new Response("UserWorker:1");
					}
				}
			`,
		});

		res = await run.worker.fetch("http://dummy/short"); // implicitly waits for UserWorker:1 to be ready
		await expect(res.text()).resolves.toBe("UserWorker:1");

		const inflightDuringReloads = run.worker.fetch("http://dummy/long");

		// this will cause workerd for UserWorker:1 to terminate (eventually, but soon)
		fireAndForgetFakeUserWorkerChanges({
			mfOpts: run.mfOpts,
			config: run.config,
			script: run.mfOpts.script.replace("UserWorker:1", "UserWorker:2"), // change response so it can be identified
		});

		res = await run.worker.fetch("http://dummy/short"); // implicitly waits for UserWorker:2 to be ready
		await expect(res.text()).resolves.toBe("UserWorker:2");

		// this will cause workerd for UserWorker:2 to terminate (eventually, but soon)
		fireAndForgetFakeUserWorkerChanges({
			mfOpts: run.mfOpts,
			config: run.config,
			script: run.mfOpts.script
				.replace("UserWorker:1", "UserWorker:3") // change response so it can be identified
				.replace("30_000", "0"), // remove the long wait as we won't reload this UserWorker
		});

		res = await inflightDuringReloads;
		await expect(res.text()).resolves.toBe("UserWorker:3");
	});
});
