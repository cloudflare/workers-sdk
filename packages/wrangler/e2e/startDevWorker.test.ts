import { Miniflare } from "miniflare";
import { beforeEach, afterEach, describe, test, expect } from "vitest";
import { DevEnv } from "wrangler";
import type { StartDevWorkerOptions } from "wrangler";
import type { MiniflareOptions } from "miniflare";
import { fetch } from "undici";

describe("startDevWorker: ProxyController", () => {
	let devEnv: DevEnv;
	let mf: Miniflare | undefined;

	beforeEach(() => {
		devEnv = new DevEnv();
	});
	afterEach(async () => {
		await new Promise((resolve) => setTimeout(resolve, 1000));

		await mf?.dispose();
		await devEnv?.teardown({ type: "teardown" });
	});

	test("ProxyWorker buffers requests while runtime reloads", async () => {
		const mfOpts: MiniflareOptions = {
			verbose: true,
			port: 0,
			inspectorPort: 9229,
			modules: true,
			compatibilityDate: "2023-08-01",
			name: "My Worker",
			script: `export default {
                fetch() {
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
			bundle: { format: "modules", modules: [] },
		});

		mf = new Miniflare(mfOpts);
		const url = await mf.ready;

		const { host } = url;
		const inspectorUrl = `ws://${url.hostname}:${mfOpts.inspectorPort}/`;

		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: { format: "modules", modules: [] },
			proxyData: {
				destinationURL: { host },
				destinationInspectorURL: inspectorUrl,
				headers: {},
			},
		});

		let res = await worker.fetch("http://dummy");

		await expect(res.text()).resolves.toBe("body:1");

		devEnv.proxy.onReloadStart({
			type: "reloadStart",
			config,
			bundle: { format: "modules", modules: [] },
		});

		mfOpts.script = mfOpts.script.replace("1", "2");
		await mf.setOptions(mfOpts);

		setTimeout(() => {
			devEnv.proxy.onReloadComplete({
				type: "reloadComplete",
				config,
				bundle: { format: "modules", modules: [] },
				proxyData: {
					destinationURL: { host },
					destinationInspectorURL: inspectorUrl,
					headers: {},
				},
			});
		}, 1000);

		res = await worker.fetch("http://dummy");
		await expect(res.text()).resolves.toBe("body:2");
	});

	test.only("InspectorProxyWorker discovery endpoints", async () => {
		const mfOpts: MiniflareOptions = {
			verbose: true,
			port: 0,
			inspectorPort: 9229,
			modules: true,
			compatibilityDate: "2023-08-01",
			name: "My Worker",
			script: `export default {
	            fetch() {
	                return new Response("body:1");
	            }
	        }`,
		};
		const config: StartDevWorkerOptions = {
			name: mfOpts.name ?? "",
			script: { contents: mfOpts.script },
			dev: {
				inspector: { port: 9777 },
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
			bundle: { format: "modules", modules: [] },
		});

		console.log();
		mf = new Miniflare(mfOpts);
		const url = await mf.ready;
		console.log(2);

		const { host } = url;
		const inspectorUrl = `ws://${url.hostname}:${mfOpts.inspectorPort}/`;

		devEnv.proxy.onReloadComplete({
			type: "reloadComplete",
			config,
			bundle: { format: "modules", modules: [] },
			proxyData: {
				destinationURL: { host },
				destinationInspectorURL: inspectorUrl,
				headers: {},
			},
		});

		await devEnv.proxy.ready;

		console.log(3);
		const res = await fetch(`http://127.0.0.1:${9777}/json`);

		console.log(4);
		const json = await res.json();

		console.log(5);
		console.log(json);
		expect(json).toBeInstanceOf(Array);
	});
});
