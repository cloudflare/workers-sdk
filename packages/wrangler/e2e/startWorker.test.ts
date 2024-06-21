import assert from "assert";
import events from "events";
import path from "path";
import { setTimeout } from "timers/promises";
import getPort from "get-port";
import dedent from "ts-dedent";
import undici from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";

const OPTIONS = [
	{ remote: false },
	// { remote: true },
] as const;

type Wrangler = Awaited<ReturnType<WranglerE2ETestHelper["importWrangler"]>>;

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

describe.each(OPTIONS)("DevEnv", ({ remote }) => {
	let helper: WranglerE2ETestHelper;
	let wrangler: Wrangler;
	let DevEnv: Wrangler["unstable_DevEnv"];
	beforeEach(async (t) => {
		helper = new WranglerE2ETestHelper();
		wrangler = await helper.importWrangler();
		DevEnv = wrangler.unstable_DevEnv;
	});

	it("ProxyWorker buffers requests while runtime reloads", async (t) => {
		let devEnv = new DevEnv();
		t.onTestFinished(() => devEnv.teardown());

		const script = dedent`
            export default {
                fetch() {
                    return new Response("body:1");
                }
            }
        `;

		await helper.seed({
			"src/index.ts": script,
		});

		const worker = devEnv.startWorker({
			entrypoint: { path: path.resolve(helper.tmpPath, "src/index.ts") },
			directory: helper.tmpPath,
			dev: { remote },
		});

		let res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:1");

		await helper.seed({
			"src/index.ts": script.replace("body:1", "body:2"),
		});
		await setTimeout(300);

		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:2");
	});
	it("InspectorProxyWorker discovery endpoints + devtools websocket connection", async (t) => {
		let devEnv = new DevEnv();
		t.onTestFinished(() => devEnv.teardown());

		const script = dedent`
            export default {
                fetch() {
                    console.log('Inside mock user worker');

                    return new Response("body:1");
                }
            }
        `;

		await helper.seed({
			"src/index.ts": script,
		});

		const worker = devEnv.startWorker({
			name: "test-worker",
			entrypoint: { path: path.resolve(helper.tmpPath, "src/index.ts") },
			directory: helper.tmpPath,
			dev: { remote },
		});

		const inspectorUrl = await worker.inspectorUrl;
		let res = await undici.fetch(`http://${inspectorUrl.host}/json`);

		await expect(res.json()).resolves.toBeInstanceOf(Array);

		const ws = new WebSocket(
			`ws://${inspectorUrl.host}/core:user:${worker.config.name}`
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
		await worker.fetch("http://dummy");

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
		await helper.seed({
			"src/index.ts": script.replace("body:1", "body:2"),
		});
		await setTimeout(300);

		await executionContextClearedPromise;
	});
	it("InspectorProxyWorker rejects unauthorised requests", async (t) => {
		let devEnv = new DevEnv();
		t.onTestFinished(() => devEnv.teardown());

		await helper.seed({
			"src/index.ts": dedent`
                export default {
                    fetch() {
                        return new Response("body:1");
                    }
                }
            `,
		});

		const worker = devEnv.startWorker({
			name: "test-worker",
			entrypoint: { path: path.resolve(helper.tmpPath, "src/index.ts") },
			directory: helper.tmpPath,
			dev: { remote },
		});

		const inspectorUrl = await worker.inspectorUrl;

		let ws = new WebSocket(
			`ws://${inspectorUrl.host}/core:user:${worker.config.name}`,
			{ setHost: false, headers: { Host: "example.com" } }
		);

		let openPromise = events.once(ws, "open");
		await expect(openPromise).rejects.toThrow("Unexpected server response");

		// Check validates `Origin` header
		ws = new WebSocket(
			`ws://${inspectorUrl.host}/core:user:${worker.config.name}`,
			{ origin: "https://example.com" }
		);
		openPromise = events.once(ws, "open");
		await expect(openPromise).rejects.toThrow("Unexpected server response");
		ws.close();
	});
	it("User worker exception", async (t) => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const devEnv = new DevEnv();
		t.onTestFinished(() => devEnv.teardown());

		await helper.seed({
			"src/index.ts": dedent`
                    export default {
                        fetch() {
							throw new Error('Boom!');
                        }
                    }
                `,
		});

		const worker = devEnv.startWorker({
			name: "test-worker",
			entrypoint: { path: path.resolve(helper.tmpPath, "src/index.ts") },
			directory: helper.tmpPath,
			dev: { remote },
		});

		let res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toMatch(/^Error: Boom!/);

		await setTimeout(100); // allow some time for the error to be logged (TODO: replace with retry/waitUntil helper)
		expect(consoleErrorSpy).toBeCalledWith(
			expect.stringContaining("Error: Boom!")
		);

		await helper.seed({
			"src/index.ts": dedent`
                    export default {
                        fetch() {
							throw new Error('Boom 2!');
                        }
                    }
                `,
		});
		await setTimeout(300);

		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toMatch(/^Error: Boom 2!/);

		await setTimeout(100); // allow some time for the error to be logged (TODO: replace with retry/waitUntil helper)
		expect(consoleErrorSpy).toBeCalledWith(
			expect.stringContaining("Error: Boom 2!")
		);

		// test eyeball requests receive the pretty error page
		await helper.seed({
			"src/index.ts": dedent`
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
		});
		await setTimeout(300);

		const undiciRes = await undici.fetch(await worker.url, {
			headers: { Accept: "text/html" },
		});
		await expect(undiciRes.text()).resolves.toEqual(
			expect.stringContaining(`<h2 class="error-message"> Boom 3! </h2>`) // pretty error page html snippet
		);

		// test further changes that fix the code
		await helper.seed({
			"src/index.ts": dedent`
                export default {
                    fetch() {
                        return new Response("body:3");
                    }
                }
            `,
		});
		await setTimeout(300);

		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:3");

		consoleErrorSpy.mockReset();
		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:3");

		await setTimeout(100); // allow some time for the error to be logged (TODO: replace with retry/waitUntil helper)
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});
	it("config.dev.{server,inspector} changes, restart the server instance", async (t) => {
		const devEnv = new DevEnv();
		t.onTestFinished(() => devEnv.teardown());

		await helper.seed({
			"src/index.ts": dedent`
                export default {
                    fetch() {
                        return new Response("body:1");
                    }
                }
            `,
		});

		const worker = devEnv.startWorker({
			name: "test-worker",
			entrypoint: { path: path.resolve(helper.tmpPath, "src/index.ts") },
			directory: helper.tmpPath,
			dev: {
				remote,
				server: { port: await getPort() },
				inspector: { port: await getPort() },
			},
		});

		let res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:1");

		const oldPort = worker.config.dev?.server?.port;
		let undiciRes = await undici.fetch(`http://127.0.0.1:${oldPort}`);
		await expect(undiciRes.text()).resolves.toBe("body:1");

		worker.patchConfig({
			dev: {
				...worker.config.dev,
				remote,
				server: { port: await getPort() },
				inspector: { port: await getPort() },
			},
		});
		const newPort = worker.config.dev?.server?.port;

		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:1");

		undiciRes = await undici.fetch(`http://127.0.0.1:${newPort}`);
		await expect(undiciRes.text()).resolves.toBe("body:1");

		await expect(
			undici.fetch(`http://127.0.0.1:${oldPort}`)
		).rejects.toThrowError("fetch failed");
	});
	it("liveReload", async (t) => {
		const devEnv = new DevEnv();
		t.onTestFinished(() => devEnv.teardown());

		await helper.seed({
			"src/index.ts": dedent`
                export default {
                    fetch() {
                        return new Response("body:1", {
							headers: { 'Content-Type': 'text/html' }
						});
                    }
                }
            `,
		});

		const worker = devEnv.startWorker({
			name: "test-worker",
			entrypoint: { path: path.resolve(helper.tmpPath, "src/index.ts") },
			directory: helper.tmpPath,
			dev: {
				remote,
				liveReload: true,
			},
		});

		const scriptRegex =
			/<script defer type="application\/javascript">([\s\S]*)<\/script>/gm;

		// test liveReload: true inserts live-reload <script> tag when the response Content-Type is html
		let res = await worker.fetch("http://dummy");
		let resText = await res.text();
		expect(resText).toEqual(expect.stringContaining("body:1"));
		expect(resText).toEqual(expect.stringMatching(scriptRegex));
		expect(resText.replace(scriptRegex, "").trim()).toEqual("body:1"); // test, without the <script> tag, the response is as authored

		await helper.seed({
			"src/index.ts": dedent`
                export default {
                    fetch() {
                        return new Response("body:2");
                    }
                }
            `,
		});
		await setTimeout(300);

		// test liveReload does nothing when the response Content-Type is not html
		res = await worker.fetch("http://dummy");
		resText = await res.text();
		expect(resText).toBe("body:2");
		expect(resText).not.toEqual(expect.stringMatching(scriptRegex));

		await helper.seed({
			"src/index.ts": dedent`
                export default {
                    fetch() {
                        return new Response("body:3", {
							headers: { 'Content-Type': 'text/html' }
						});
                    }
                }
            `,
		});
		worker.patchConfig({
			dev: {
				...worker.config.dev,
				liveReload: false,
			},
		});

		// test liveReload: false does nothing even when the response Content-Type is html
		res = await worker.fetch("http://dummy");
		resText = await res.text();
		expect(resText).toBe("body:3");
		expect(resText).not.toEqual(expect.stringMatching(scriptRegex));
	});
	it("urlOverrides take effect in the UserWorker", async (t) => {
		const devEnv = new DevEnv();
		t.onTestFinished(() => devEnv.teardown());

		await helper.seed({
			"src/index.ts": dedent`
                export default {
                    fetch(request) {
                        return new Response("URL: " + request.url);
                    }
                }
            `,
		});

		const worker = devEnv.startWorker({
			name: "test-worker",
			entrypoint: { path: path.resolve(helper.tmpPath, "src/index.ts") },
			directory: helper.tmpPath,
			dev: {
				remote,
				origin: {
					hostname: "www.google.com",
				},
			},
		});

		let res = await worker.fetch("http://dummy/test/path/1");
		await expect(res.text()).resolves.toBe(
			`URL: http://www.google.com/test/path/1`
		);

		worker.patchConfig({
			dev: {
				...worker.config.dev,
				origin: {
					secure: true,
					hostname: "mybank.co.uk",
				},
			},
		});

		res = await worker.fetch("http://dummy/test/path/2");
		await expect(res.text()).resolves.toBe(
			"URL: https://mybank.co.uk/test/path/2"
		);
	});
	it("inflight requests are retried during UserWorker reloads", async (t) => {
		// to simulate inflight requests failing during UserWorker reloads,
		// we will use a UserWorker with a longish `await setTimeout(...)`
		// so that we can guarantee the race condition is hit
		// when workerd is eventually terminated

		const devEnv = new DevEnv();
		t.onTestFinished(() => devEnv.teardown());

		const script = dedent`
            export default {
                async fetch(request) {
                    const url = new URL(request.url);

                    if (url.pathname === '/long') {
                        await new Promise(r => setTimeout(r, 30_000));
                    }

                    return new Response("UserWorker:1");
                }
            }
        `;

		await helper.seed({
			"src/index.ts": script,
		});

		const worker = devEnv.startWorker({
			name: "test-worker",
			entrypoint: { path: path.resolve(helper.tmpPath, "src/index.ts") },
			directory: helper.tmpPath,
			dev: {
				remote,
				origin: {
					hostname: "www.google.com",
				},
			},
		});

		let res = await worker.fetch("http://dummy/short");
		await expect(res.text()).resolves.toBe("UserWorker:1");

		const inflightDuringReloads = worker.fetch("http://dummy/long"); // NOTE: no await

		// this will cause workerd for UserWorker:1 to terminate (eventually, but soon)
		await helper.seed({
			"src/index.ts": script.replace("UserWorker:1", "UserWorker:2"),
		});
		await setTimeout(300);

		res = await worker.fetch("http://dummy/short");
		await expect(res.text()).resolves.toBe("UserWorker:2");

		// this will cause workerd for UserWorker:2 to terminate (eventually, but soon)
		await helper.seed({
			"src/index.ts": script
				.replace("UserWorker:1", "UserWorker:3") // change response so it can be identified
				.replace("30_000", "0"), // remove the long wait as we won't reload this UserWorker
		});

		res = await inflightDuringReloads;
		await expect(res.text()).resolves.toBe("UserWorker:3");
	});
});
