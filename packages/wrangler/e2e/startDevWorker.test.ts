import assert from "node:assert";
import getPort from "get-port";
import {
	Miniflare,
	type Response as MiniflareResponse,
	type MiniflareOptions,
} from "miniflare";
import * as undici from "undici";
import { beforeEach, afterEach, describe, test, expect, vi } from "vitest";
import { DevEnv } from "wrangler";
import type { StartDevWorkerOptions } from "../src/api/startDevWorker/types";
import type { EsbuildBundle } from "../src/dev/use-esbuild";

describe("startDevWorker: ProxyController", () => {
	let devEnv: DevEnv;
	let mf: Miniflare | undefined;
	const fakeBundle = {} as EsbuildBundle;
	let res: MiniflareResponse | undici.Response | undefined;

	beforeEach(() => {
		devEnv = new DevEnv();
		res = undefined;
	});
	afterEach(async () => {
		await new Promise((resolve) => setTimeout(resolve, 1000));

		await mf?.dispose();
		await devEnv?.teardown();
	});

	test("ProxyWorker buffers requests while runtime reloads", async () => {
		const mfOpts: MiniflareOptions = {
			// verbose: true,
			port: 0,
			inspectorPort: await getPort(),
			modules: true,
			compatibilityDate: "2023-08-01",
			name: "My-Worker",
			script: `export default {
                fetch(req) {
                    return new Response("body:1");
                }
            }`,
		};
		const config: StartDevWorkerOptions = {
			name: mfOpts.name ?? "",
			script: { contents: mfOpts.script },
		};

		const worker = devEnv.startWorker(config);

		devEnv.proxy.onConfigUpdate({
			type: "configUpdate",
			config,
		});

		devEnv.proxy.onReloadStart({
			type: "reloadStart",
			config,
			bundle: fakeBundle,
		});

		mf = new Miniflare(mfOpts);
		const url = await mf.ready;
		const inspectorUrl = `ws://${url.hostname}:${mfOpts.inspectorPort}/core:user:My-Worker`;

		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: fakeBundle,
			proxyData: {
				destinationURL: { host: url.host },
				destinationInspectorURL: inspectorUrl,
				headers: {},
			},
		});

		res = await worker.fetch("http://dummy");

		await expect(res.text()).resolves.toBe("body:1");

		devEnv.proxy.onReloadStart({
			type: "reloadStart",
			config,
			bundle: fakeBundle,
		});

		mfOpts.script = mfOpts.script.replace("1", "2");
		await mf.setOptions(mfOpts);

		setTimeout(() => {
			devEnv.proxy.onReloadComplete({
				type: "reloadComplete",
				config,
				bundle: fakeBundle,
				proxyData: {
					destinationURL: { host: url.host },
					destinationInspectorURL: inspectorUrl,
					headers: {},
				},
			});
		}, 1000);

		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:2");
	});

	test("InspectorProxyWorker discovery endpoints", async () => {
		const mfOpts: MiniflareOptions = {
			// verbose: true,
			port: 0,
			inspectorPort: await getPort(), // TODO: get workerd to report the inspectorPort so we can set 0 and retrieve the actual port later
			modules: true,
			compatibilityDate: "2023-08-01",
			name: "My-Worker",
			script: `export default {
	            fetch() {
                    console.log('Inside mock user worker');
	                return new Response("body:1");
	            }
	        }`,
		};
		const config: StartDevWorkerOptions = {
			name: mfOpts.name ?? "",
			script: { contents: mfOpts.script },
			dev: {
				inspector: { port: 9230 },
			},
		};

		const worker = devEnv.startWorker(config);

		devEnv.proxy.onConfigUpdate({
			type: "configUpdate",
			config,
		});

		devEnv.proxy.onReloadStart({
			type: "reloadStart",
			config,
			bundle: fakeBundle,
		});

		mf = new Miniflare(mfOpts);
		const url = await mf.ready;
		const inspectorUrl = `ws://${url.hostname}:${mfOpts.inspectorPort}/core:user:My-Worker`;

		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: fakeBundle,
			proxyData: {
				destinationURL: { host: url.host },
				destinationInspectorURL: inspectorUrl,
				headers: {},
			},
		});

		await devEnv.proxy.ready;
		res = await undici.fetch(`http://127.0.0.1:${9230}/json`);

		await expect(res.json()).resolves.toBeInstanceOf(Array);

		const ws = new undici.WebSocket(`ws://127.0.0.1:${9230}/ws`);
		const openPromise = new Promise((resolve) => {
			ws.addEventListener("open", (event) => {
				resolve(event);
			});
		});
		const messagePromise = new Promise((resolve) => {
			ws.addEventListener("message", (event) => {
				assert(typeof event.data === "string");
				if (event.data.includes("Runtime.consoleAPICalled")) resolve(event);
			});
		});

		await openPromise;
		await worker.fetch("http://localhost");
		await expect(messagePromise).resolves.toMatchObject({
			type: "message",
			data: expect.stringContaining("Inside mock user worker"),
		});
	});

	test.skip(
		"DevTools reconnect on reloadComplete", // workerd bug: executionContextId not incrementing
		async () => {
			const mfOpts: MiniflareOptions = {
				// verbose: true,
				port: 0,
				inspectorPort: await getPort(),
				modules: true,
				compatibilityDate: "2023-08-01",
				name: "My-Worker",
				script: `export default {
                fetch(req) {
                    // debugger;
                    console.log('Inside worker');
                    return new Response("body:1");
                }
            }`,
			};
			const config: StartDevWorkerOptions = {
				name: mfOpts.name ?? "",
				script: { contents: mfOpts.script },
				dev: {
					server: { port: 9898 },
					inspector: { port: 9899 },
				},
			};

			const worker = devEnv.startWorker(config);

			devEnv.proxy.onConfigUpdate({
				type: "configUpdate",
				config,
			});

			devEnv.proxy.onReloadStart({
				type: "reloadStart",
				config,
				bundle: fakeBundle,
			});

			mf = new Miniflare(mfOpts);
			const url = await mf.ready;
			const inspectorUrl = `ws://${url.hostname}:${mfOpts.inspectorPort}/core:user:My-Worker`;

			devEnv.proxy.onReloadComplete({
				type: "reloadComplete",
				config,
				bundle: fakeBundle,
				proxyData: {
					destinationURL: { host: url.host },
					destinationInspectorURL: inspectorUrl,
					headers: {},
				},
			});

			// res = await worker.fetch("http://dummy");
			// await expect(res.text()).resolves.toBe("body:1");

			setTimeout(async () => {
				devEnv.proxy.onReloadStart({
					type: "reloadStart",
					config,
					bundle: fakeBundle,
				});

				mfOpts.script = mfOpts.script.replace("1", "2");
				await mf?.setOptions(mfOpts);

				devEnv.proxy.onReloadComplete({
					type: "reloadComplete",
					config,
					bundle: fakeBundle,
					proxyData: {
						destinationURL: { host: url.host },
						destinationInspectorURL: inspectorUrl,
						headers: {},
					},
				});

				res = await worker.fetch("http://dummy");
			}, 5_000);

			console.log(url);

			// res = await worker.fetch("http://dummy");
			// await expect(res.text()).resolves.toBe("body:2");

			await new Promise((r) => setTimeout(r, 60_000));
		},
		{ timeout: 10_000 }
	);

	test("User worker exception", async () => {
		vi.spyOn(console, "error");

		const mfOpts: MiniflareOptions = {
			// verbose: true,
			port: 0,
			inspectorPort: await getPort(),
			modules: true,
			compatibilityDate: "2023-08-01",
			name: "My-Worker",
			script: `export default {
                fetch(req) {
                    throw new Error('Boom!');
                    return new Response("body:1");
                }
            }`,
		};
		const config: StartDevWorkerOptions = {
			name: mfOpts.name ?? "",
			script: { contents: mfOpts.script },
		};

		const worker = devEnv.startWorker(config);

		devEnv.proxy.onConfigUpdate({
			type: "configUpdate",
			config,
		});

		devEnv.proxy.onReloadStart({
			type: "reloadStart",
			config,
			bundle: fakeBundle,
		});

		mf = new Miniflare(mfOpts);
		const url = await mf.ready;
		const inspectorUrl = `ws://${url.hostname}:${mfOpts.inspectorPort}/core:user:My-Worker`;

		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: fakeBundle,
			proxyData: {
				destinationURL: { host: url.host },
				destinationInspectorURL: inspectorUrl,
				headers: {},
			},
		});

		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toMatchObject({});

		expect(console.error).toBeCalledWith(
			expect.stringContaining("Uncaught (in response) Error: Boom!")
		);
	});

	test("config.dev.{server,inspector} changes, restart the server instance", async () => {
		const mfOpts: MiniflareOptions = {
			// verbose: true,
			port: 0,
			inspectorPort: await getPort(),
			modules: true,
			compatibilityDate: "2023-08-01",
			name: "My-Worker",
			script: `export default {
                fetch(req) {
                    return new Response("body:1");
                }
            }`,
		};
		let config: StartDevWorkerOptions = {
			name: mfOpts.name ?? "",
			script: { contents: mfOpts.script },
			dev: {
				server: { port: await getPort() },
				inspector: { port: await getPort() },
			},
		};

		const worker = devEnv.startWorker(config);

		devEnv.proxy.onConfigUpdate({
			type: "configUpdate",
			config,
		});
		console.log(config);

		devEnv.proxy.onReloadStart({
			type: "reloadStart",
			config,
			bundle: fakeBundle,
		});

		mf = new Miniflare(mfOpts);
		const userWorkerUrl = await mf.ready;
		const inspectorUrl = `ws://${userWorkerUrl.hostname}:${mfOpts.inspectorPort}/core:user:My-Worker`;

		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: fakeBundle,
			proxyData: {
				destinationURL: { host: userWorkerUrl.host },
				destinationInspectorURL: inspectorUrl,
				headers: {},
			},
		});

		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:1");
		console.log("worker.fetch succeeded");

		const oldPort = config.dev?.server?.port;
		res = await undici.fetch(`http://127.0.0.1:${oldPort}`);
		await expect(res.text()).resolves.toBe("body:1");
		console.log("fetch succeeded");

		config = {
			name: mfOpts.name ?? "",
			script: { contents: mfOpts.script },
			dev: {
				server: { port: await getPort() },
				inspector: { port: await getPort() },
			},
		};

		devEnv.proxy.onConfigUpdate({
			type: "configUpdate",
			config,
		});
		console.log(config);

		console.time("ready");
		await worker.ready;
		console.timeEnd("ready");

		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: fakeBundle,
			proxyData: {
				destinationURL: { host: userWorkerUrl.host },
				destinationInspectorURL: inspectorUrl,
				headers: {},
			},
		});

		await expect(
			undici.fetch(`http://127.0.0.1:${oldPort}`)
		).rejects.toMatchInlineSnapshot("[TypeError: fetch failed]");

		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:1");

		const newPort = config.dev?.server?.port;
		res = await undici.fetch(`http://127.0.0.1:${newPort}`);
		await expect(res.text()).resolves.toBe("body:1");
	});
});
