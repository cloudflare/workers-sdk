import assert from "node:assert";
import getPort from "get-port";
import {
	Miniflare,
	type Response as MiniflareResponse,
	type MiniflareOptions,
} from "miniflare";
import * as undici from "undici";
import { beforeEach, afterEach, describe, test, expect, vi } from "vitest";
import { unstable_DevEnv as DevEnv } from "wrangler";
import type { ProxyData } from "../src/api";
import type { StartDevWorkerOptions } from "../src/api/startDevWorker/types";
import type { EsbuildBundle } from "../src/dev/use-esbuild";

const fakeBundle = {} as EsbuildBundle;

let devEnv: DevEnv;
let mf: Miniflare | undefined;
let res: MiniflareResponse | undici.Response | undefined;
let ws: undici.WebSocket | undefined;

beforeEach(() => {
	devEnv = new DevEnv();
	mf = undefined;
	res = undefined;
	ws = undefined;
});
afterEach(async () => {
	// await new Promise((resolve) => setTimeout(resolve, 1000));

	await devEnv?.teardown();
	await mf?.dispose();
	await ws?.close();

	vi.resetAllMocks();
});

async function fakeStartUserWorker(options: {
	script: string;
	name?: string;
	mfOpts?: Partial<MiniflareOptions>;
	config?: Omit<StartDevWorkerOptions, "name" | "script">;
}) {
	const config: StartDevWorkerOptions = {
		...options.config,
		name: options.name ?? "test-worker",
		script: { contents: options.script },
		dev: {
			inspector: { port: await getPort() },
			...options.config?.dev,
		},
	};
	const mfOpts: MiniflareOptions = Object.assign(
		{
			port: 0,
			inspectorPort: await getPort(), // TODO: get workerd to report the inspectorPort so we can set 0 and retrieve the actual port later
			modules: true,
			compatibilityDate: "2023-08-01",
			name: config.name,
			script: options.script,
		},
		options.mfOpts
	);

	assert("script" in mfOpts);

	const worker = devEnv.startWorker(config);

	fakeConfigUpdate(config);
	fakeReloadStart(config);

	mf = new Miniflare(mfOpts);

	const url = await mf.ready;
	fakeReloadComplete(config, mfOpts, url);

	return { worker, mf, mfOpts, config, url };
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
			...(script ? { script } : undefined),
		},
	};
	mfOpts = {
		...mfOpts,
		script: script ?? mfOpts.script,
	};

	fakeReloadStart(config);

	await mf.setOptions(mfOpts);

	const url = await mf.ready;
	fakeReloadComplete(config, mfOpts, url, 1000);

	return { mfOpts, config, mf, url };
}

function fireAndForgetFakeUserWorkerChanges(
	...args: Parameters<typeof fakeUserWorkerChanges>
) {
	// fire and forget the reload -- this let's us test request buffering
	void fakeUserWorkerChanges(...args);
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
	mfUrl: URL,
	delay = 10
) {
	const proxyData: ProxyData = {
		userWorkerUrl: {
			protocol: mfUrl.protocol,
			hostname: mfUrl.host,
			port: mfUrl.port,
		},
		userWorkerInspectorUrl: {
			protocol: "ws:",
			hostname: "127.0.0.1",
			port: String(mfOpts.inspectorPort),
			pathname: `/core:user:${config.name}`,
		},
		headers: {},
	};

	setTimeout(() => {
		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: fakeBundle,
			proxyData,
		});
	}, delay);

	return { config, mfOpts }; // convenience to allow calling and defining new config/mfOpts inline but also store the new objects
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
			mfOpts: {
				...run.mfOpts,
				script: run.mfOpts.script.replace("1", "2"),
			},
			config: run.config,
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
			config: { dev: { inspector: { port: await getPort() } } },
		});

		await devEnv.proxy.ready;
		res = await undici.fetch(
			`http://127.0.0.1:${run.config.dev?.inspector?.port}/json`
		);

		await expect(res.json()).resolves.toBeInstanceOf(Array);

		ws = new undici.WebSocket(
			`ws://127.0.0.1:${run.config.dev?.inspector?.port}/core:user:${run.config.name}`
		);
		const openPromise = new Promise((resolve) => {
			ws?.addEventListener("open", resolve);
		});
		const consoleAPICalledPromise = new Promise((resolve) => {
			ws?.addEventListener("message", (event) => {
				assert(typeof event.data === "string");
				if (event.data.includes("Runtime.consoleAPICalled")) {
					resolve(JSON.parse(event.data));
				}
			});
		});
		const executionContextCreatedPromise = new Promise((resolve) => {
			ws?.addEventListener("message", (event) => {
				assert(typeof event.data === "string");
				if (event.data.includes("Runtime.executionContextCreated")) {
					resolve(JSON.parse(event.data));
				}
			});
		});

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
				context: { id: 1 },
			},
		});
	});

	test(
		"User worker exception",
		async () => {
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
			await expect(res.text()).resolves.toMatchObject({});

			expect(consoleErrorSpy).toBeCalledWith(
				expect.stringContaining("Error: Boom!")
			);

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
			await expect(res.text()).resolves.toMatchObject({});

			expect(consoleErrorSpy).toBeCalledWith(
				expect.stringContaining("Error: Boom 2!")
			);

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
			await expect(res.text()).resolves.toMatchObject({});

			consoleErrorSpy.mockReset();
			res = await run.worker.fetch("http://dummy");
			await expect(res.text()).resolves.toBe("body:3");
			expect(consoleErrorSpy).not.toHaveBeenCalled();
		},
		{ retry: 10 } // for some reason vi.spyOn(console, 'error') is flakey
	);

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
		fakeReloadComplete(config2, run.mfOpts, run.url);

		const newPort = config2.dev?.server?.port;

		res = await run.worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:1");

		res = await undici.fetch(`http://127.0.0.1:${newPort}`);
		await expect(res.text()).resolves.toBe("body:1");

		await expect(
			undici.fetch(`http://127.0.0.1:${oldPort}`).then((r) => r.text())
		).rejects.toMatchInlineSnapshot("[TypeError: fetch failed]");
	});

	test("liveReload", () => {});
});
