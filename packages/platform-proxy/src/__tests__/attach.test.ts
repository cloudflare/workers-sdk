import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { createRequire } from "node:module";
import readline from "node:readline";
import { Miniflare, Response } from "miniflare";
import { describe, it, onTestFinished, vi } from "vitest";
import { ExecutionContext } from "../execution-context";
import { getPlatformProxy } from "../index";
import type { KVNamespace } from "@cloudflare/workers-types/experimental";
import type { WorkerOptions } from "miniflare";

// Attaching never reads a config, so it mustn't load the config parser
vi.mock("@cloudflare/config", () => {
	throw new Error("@cloudflare/config was loaded");
});

function manifest(contents: string) {
	return {
		mainModule: "index.mjs",
		modules: { "index.mjs": { type: "esm" as const, contents } },
	};
}

function worker(name: string): WorkerOptions {
	return {
		config: {
			name,
			compatibilityDate: "2026-10-01",
			manifest: manifest(
				`export default { fetch() { return new Response("ok"); } };`
			),
			env: {
				NAME: { type: "text", value: name },
				NAMESPACE: { type: "kv" },
			},
		},
	};
}

type Env = { NAME: string; NAMESPACE: KVNamespace };

/**
 * Starts a dev server in this process that forwards to Miniflare, like the
 * Cloudflare Vite plugin.
 *
 * @param mf The Miniflare instance to forward to.
 * @returns The dev server's URL.
 */
async function startDevServer(mf: Miniflare): Promise<string> {
	const devServer = http.createServer(async (req, res) => {
		const response = await mf.dispatchFetch(
			new URL(req.url ?? "/", "http://localhost"),
			{
				method: req.method,
				headers: req.headers as Record<string, string>,
			}
		);
		res.writeHead(response.status, Object.fromEntries(response.headers));
		res.end(Buffer.from(await response.arrayBuffer()));
	});
	await new Promise<void>((resolve) => devServer.listen(0, resolve));
	onTestFinished(() => {
		devServer.close();
	});
	const { port } = devServer.address() as { port: number };
	return `http://localhost:${port}`;
}

describe("getPlatformProxy({ url })", () => {
	it("attaches to a Worker in a runtime that's already running", async ({
		expect,
	}) => {
		const mf = new Miniflare({ workers: [worker("my-worker")] });
		onTestFinished(() => mf.dispose());

		const proxy = await getPlatformProxy<Env>({ url: await mf.ready });
		onTestFinished(() => proxy.dispose());

		expect(proxy.env.NAME).toBe("my-worker");
		await proxy.env.NAMESPACE.put("key", "value");
		expect(await proxy.env.NAMESPACE.get("key")).toBe("value");
		expect(proxy.ctx).toBeInstanceOf(ExecutionContext);
	});

	it("attaches through a dev server in the same process without deadlocking", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			cf: { colo: "TEST" },
			workers: [worker("app")],
		});
		onTestFinished(() => mf.dispose());
		// Reading a binding blocks this thread until the reply arrives, so if the
		// client sent those reads through this dev server rather than to the
		// runtime directly, nothing could answer them and the test would hang
		const url = await startDevServer(mf);

		const proxy = await getPlatformProxy<Env>({ url });
		onTestFinished(() => proxy.dispose());
		expect(proxy.env.NAME).toBe("app");
		await proxy.env.NAMESPACE.put("key", "value");
		expect(await (await mf.getBindings<Env>()).NAMESPACE.get("key")).toBe(
			"value"
		);
		expect(proxy.cf).toMatchObject({ colo: "TEST" });

		await expect(getPlatformProxy({ url, secret: "wrong" })).rejects.toThrow(
			"status 401"
		);
	});

	it("connects again after the runtime restarts", async ({ expect }) => {
		const mf = new Miniflare({ workers: [worker("app")] });
		onTestFinished(() => mf.dispose());
		const url = await startDevServer(mf);
		const proxy = await getPlatformProxy<Env>({ url });
		onTestFinished(() => proxy.dispose());
		// Kept from before the restart, as frameworks do
		const { env, cf } = proxy;
		const runtimeUrl = await mf.ready;

		// Like the Vite plugin after a config change, which restarts the runtime
		// on a new port
		await mf.setOptions({ cf: { colo: "NEW" }, workers: [worker("renamed")] });
		expect((await mf.ready).port).not.toBe(runtimeUrl.port);
		await vi.waitFor(() => expect(env.NAME).toBe("renamed"));
		expect(cf).toMatchObject({ colo: "NEW" });
		await env.NAMESPACE.put("key", "value");
		expect(await env.NAMESPACE.get("key")).toBe("value");
	});

	it("uses the first Worker that isn't internal", async ({ expect }) => {
		// Like the Vite plugin's router Worker, which comes before the user's
		const mf = new Miniflare({
			workers: [
				{ ...worker("router"), dev: { unsafeRegisterWorker: false } },
				worker("app"),
			],
		});
		onTestFinished(() => mf.dispose());

		const proxy = await getPlatformProxy<Env>({ url: await mf.ready });
		onTestFinished(() => proxy.dispose());
		expect(proxy.env.NAME).toBe("app");
	});

	it("calls Worker code that needs this process without deadlocking", async ({
		expect,
	}) => {
		// `greet()` calls back into this process, like Worker code served by
		// Vite's module runner. Reading or calling it synchronously would block
		// this thread, so nothing could answer that call.
		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "app",
						compatibilityDate: "2026-10-01",
						manifest: manifest(`
							import { WorkerEntrypoint } from "cloudflare:workers";
							export default class extends WorkerEntrypoint {}
							export class Greeter extends WorkerEntrypoint {
								get greeting() {
									return "Hello";
								}
								get broken() {
									throw new Error("Unavailable");
								}
								async greet(name) {
									return (await this.env.NODE.fetch("http://x/" + name)).text();
								}
							}
						`),
						env: {
							GREETER: {
								type: "worker",
								worker: "app",
								exportName: "Greeter",
							},
							NODE: {
								type: "fetcher",
								handler: (request) =>
									new Response(
										`Hello, ${new URL(request.url).pathname.slice(1)}`
									),
							},
						},
					},
				},
			],
		});
		onTestFinished(() => mf.dispose());
		const proxy = await getPlatformProxy<{
			GREETER: {
				greeting: Promise<string>;
				broken: Promise<string>;
				greet(name: string): Promise<string>;
			};
		}>({ url: await mf.ready });
		onTestFinished(() => proxy.dispose());

		expect(await proxy.env.GREETER.greet("world")).toBe("Hello, world");
		// As in `workerd`, a property is read by awaiting it
		expect(await proxy.env.GREETER.greeting).toBe("Hello");
		await expect(proxy.env.GREETER.broken).rejects.toThrow("Unavailable");
	});

	it("passes Hyperdrive, data blob and Wasm bindings", async ({ expect }) => {
		// Exports `add(a, b)`
		const wasm = new Uint8Array([
			0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60,
			0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01,
			0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20,
			0x00, 0x20, 0x01, 0x6a, 0x0b,
		]);
		const connectionString =
			"postgresql://user:password@localhost:5432/database";
		// A legacy service worker, as data blobs and Wasm modules need one
		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "app",
						compatibilityDate: "2026-10-01",
						env: {
							HYPERDRIVE: {
								type: "hyperdrive",
								id: "hyperdrive",
								dev: { connectionString },
							},
						},
					},
					legacy: {
						serviceWorkerScript: `addEventListener("fetch", (event) => event.respondWith(new Response("ok")));`,
						dataBlobBindings: { DATA: new Uint8Array([1, 2, 3]) },
						wasmBindings: { ADD: wasm },
					},
				},
			],
		});
		onTestFinished(() => mf.dispose());

		const proxy = await getPlatformProxy<{
			HYPERDRIVE: { connectionString: string; host: string; port: number };
			DATA: ArrayBuffer;
			ADD: WebAssembly.Module;
		}>({ url: await mf.ready });
		onTestFinished(() => proxy.dispose());
		// Node.js gets the local connection details, as with `getBindings()`
		expect(proxy.env.HYPERDRIVE.connectionString).toBe(connectionString);
		expect(proxy.env.HYPERDRIVE.host).toBe("localhost");
		expect(proxy.env.HYPERDRIVE.port).toBe(5432);
		expect(new Uint8Array(proxy.env.DATA)).toEqual(new Uint8Array([1, 2, 3]));
		const instance = new WebAssembly.Instance(proxy.env.ADD);
		expect(
			(instance.exports.add as (a: number, b: number) => number)(1, 2)
		).toBe(3);
	});

	it("uses the given secret for every request", async ({ expect }) => {
		// Run the runtime in another process with a known secret, until stdin closes
		const miniflarePath = createRequire(import.meta.url).resolve("miniflare");
		const child = `
			const { Miniflare } = require(${JSON.stringify(miniflarePath)});
			const mf = new Miniflare(JSON.parse(process.argv[1]));
			mf.ready.then((url) => console.log(url.href));
			process.stdin.on("end", () => mf.dispose().then(() => process.exit()));
			process.stdin.resume();`;
		const runtime = spawn(
			process.execPath,
			["-e", child, JSON.stringify({ workers: [worker("app")] })],
			{
				env: {
					...process.env,
					MINIFLARE_PLATFORM_PROXY_SECRET: "runtime-secret",
				},
				stdio: ["pipe", "pipe", "inherit"],
			}
		);
		onTestFinished(async () => {
			const exited = once(runtime, "exit");
			runtime.stdin.end();
			await exited;
		});
		const [url] = await once(
			readline.createInterface({ input: runtime.stdout }),
			"line"
		);

		// This process has its own random secret, so this only passes if the
		// given `secret` is used for every request, not just the handshake
		await expect(getPlatformProxy({ url })).rejects.toThrow("status 401");
		const proxy = await getPlatformProxy<Env>({
			url,
			secret: "runtime-secret",
		});
		onTestFinished(() => proxy.dispose());
		await proxy.env.NAMESPACE.put("key", "value");
		expect(await proxy.env.NAMESPACE.get("key")).toBe("value");
	});
});
