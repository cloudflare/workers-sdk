import fs from "node:fs/promises";
import path from "node:path";
import { watch } from "chokidar";
import { getWorkerRegistry, Miniflare } from "miniflare";
import { describe, onTestFinished, test, vi } from "vitest";
import { DevRegistry } from "../src/shared/dev-registry";
import {
	singleModuleManifest,
	TestLog,
	useDispose,
	useTmp,
} from "./test-shared";
import type {
	MiniflareOptions,
	WorkerDefinition,
	WorkerRegistry,
} from "miniflare";

describe.sequential("DevRegistry", () => {
	test("surfaces fresh legacy entries and removes them when stale", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const definitionPath = path.join(unsafeDevRegistryPath, "legacy-worker");
		await fs.writeFile(
			definitionPath,
			JSON.stringify({
				debugPortAddress: "127.0.0.1:1234",
				defaultEntrypointService: "core:user:legacy-worker",
				userWorkerService: "core:user:legacy-worker",
			})
		);

		const legacyDefinition = getWorkerRegistry(unsafeDevRegistryPath)[
			"legacy-worker"
		];
		expect(legacyDefinition).toEqual(
			expect.objectContaining({
				debugPortAddress: "127.0.0.1:1234",
			})
		);
		expect(legacyDefinition.instanceId).toBeUndefined();

		const stale = new Date(Date.now() - 91_000);
		await fs.utimes(definitionPath, stale, stale);
		expect(getWorkerRegistry(unsafeDevRegistryPath)).toEqual({});
		await expect(fs.stat(definitionPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("registers after a conflicting entry becomes stale", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const definitionPath = path.join(unsafeDevRegistryPath, "worker");
		const definition: WorkerDefinition = {
			debugPortAddress: "127.0.0.1:1234",
			defaultEntrypointService: "core:user:worker",
			userWorkerService: "core:user:worker",
		};
		await fs.writeFile(
			definitionPath,
			JSON.stringify({ ...definition, instanceId: "previous-instance" })
		);

		const registry = new DevRegistry(
			unsafeDevRegistryPath,
			undefined,
			new TestLog()
		);
		vi.useFakeTimers();
		try {
			registry.register({ worker: definition });
			expect(
				JSON.parse(await fs.readFile(definitionPath, "utf8")).instanceId
			).toBe("previous-instance");

			await vi.advanceTimersByTimeAsync(90_001);

			expect(
				JSON.parse(await fs.readFile(definitionPath, "utf8")).instanceId
			).toBe(registry.instanceId);
		} finally {
			await registry.dispose();
			vi.useRealTimers();
		}
	});

	test("re-registers its entry after stale cleanup removes it", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const definitionPath = path.join(unsafeDevRegistryPath, "worker");
		const definition: WorkerDefinition = {
			debugPortAddress: "127.0.0.1:1234",
			defaultEntrypointService: "core:user:worker",
			userWorkerService: "core:user:worker",
		};

		const registry = new DevRegistry(
			unsafeDevRegistryPath,
			undefined,
			new TestLog()
		);
		vi.useFakeTimers();
		try {
			registry.register({ worker: definition });
			expect(
				JSON.parse(await fs.readFile(definitionPath, "utf8")).instanceId
			).toBe(registry.instanceId);

			// Suspending the machine for longer than the stale window freezes this
			// process's heartbeat as well, so on resume the sweep deletes an entry
			// whose owner is still running.
			const stale = new Date(Date.now() - 91_000);
			await fs.utimes(definitionPath, stale, stale);
			expect(getWorkerRegistry(unsafeDevRegistryPath)).toEqual({});
			await expect(fs.stat(definitionPath)).rejects.toMatchObject({
				code: "ENOENT",
			});

			await vi.advanceTimersByTimeAsync(10_001);

			expect(JSON.parse(await fs.readFile(definitionPath, "utf8"))).toEqual({
				...definition,
				instanceId: registry.instanceId,
			});
			expect(getWorkerRegistry(unsafeDevRegistryPath)).toEqual(
				expect.objectContaining({
					worker: expect.objectContaining({
						debugPortAddress: "127.0.0.1:1234",
					}),
				})
			);
		} finally {
			await registry.dispose();
			vi.useRealTimers();
		}
	});

	test("leaves an entry claimed by another process alone", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const definitionPath = path.join(unsafeDevRegistryPath, "worker");
		const definition: WorkerDefinition = {
			debugPortAddress: "127.0.0.1:1234",
			defaultEntrypointService: "core:user:worker",
			userWorkerService: "core:user:worker",
		};

		const registry = new DevRegistry(
			unsafeDevRegistryPath,
			undefined,
			new TestLog()
		);
		vi.useFakeTimers();
		try {
			registry.register({ worker: definition });
			expect(
				JSON.parse(await fs.readFile(definitionPath, "utf8")).instanceId
			).toBe(registry.instanceId);

			await fs.writeFile(
				definitionPath,
				JSON.stringify({
					...definition,
					debugPortAddress: "127.0.0.1:5678",
					instanceId: "another-instance",
				})
			);

			await vi.advanceTimersByTimeAsync(10_001);

			expect(JSON.parse(await fs.readFile(definitionPath, "utf8"))).toEqual({
				...definition,
				debugPortAddress: "127.0.0.1:5678",
				instanceId: "another-instance",
			});
		} finally {
			await registry.dispose();
			vi.useRealTimers();
		}
	});

	test("registers workers by default unless opted out", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const worker = {
			config: {
				type: "worker",
				name: "worker",
				compatibilityDate: "2025-05-01",
				compatibilityFlags: ["experimental"],
				manifest: singleModuleManifest(
					`export default { fetch() { return new Response("ok"); } };`
				),
			},
		} satisfies MiniflareOptions["workers"][number];
		const workerOptions = {
			unsafeDevRegistryPath,
			workers: [worker],
		} satisfies MiniflareOptions;
		const mf = new Miniflare(workerOptions);
		useDispose(mf);
		await mf.ready;

		await vi.waitFor(() => {
			expect(getWorkerRegistry(unsafeDevRegistryPath)["worker"]).toBeDefined();
		});

		await mf.setOptions({
			...workerOptions,
			workers: [{ ...worker, dev: { unsafeRegisterWorker: false } }],
		});
		await vi.waitFor(() => {
			expect(getWorkerRegistry(unsafeDevRegistryPath)).toEqual({});
		});
	});

	test("fetch to service worker", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
					},
					legacy: {
						serviceWorkerScript: `addEventListener("fetch", (event) => {
				event.respondWith(new Response("Hello from service worker!"));
			})`,
					},
				},
			],
		});

		await remote.ready;

		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						return await env.SERVICE.fetch(request);
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");

		expect(await res.text()).toBe("Hello from service worker!");
		expect(res.status).toBe(200);

		// Kill the remote worker to see if it fails gracefully
		await remote.dispose();
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");

				expect(await res.text()).toBe(
					`Worker "remote-worker" not found. Make sure it is running locally.`
				);
				expect(res.status).toBe(503);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to module worker", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						const response = await env.SERVICE.fetch(request.url);
						const text = await response.text();

						return new Response("Response from remote worker: " + text, {
							status: response.status,
						});
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://example.com?name=World");
		expect(await res.text()).toBe(
			`Response from remote worker: Worker "remote-worker" not found. Make sure it is running locally.`
		);
		expect(res.status).toBe(503);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
	                    const url = new URL(request.url);
	                    const name = url.searchParams.get("name") ?? 'anonymous';

						return new Response("Hello " + name);
					}
				}
			`),
					},
				},
			],
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://example.com?name=World");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: Hello World");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("WebSocket upgrade to module worker", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						const wsResponse = await env.SERVICE.fetch(request.url, {
							headers: { Upgrade: "websocket" }
						});

						if (wsResponse.webSocket) {
							wsResponse.webSocket.accept();

							const messagePromise = new Promise((resolve) => {
								wsResponse.webSocket.addEventListener("message", (event) => {
									resolve(event.data);
								});
							});

							// Test bidirectional communication
							wsResponse.webSocket.send("ping");

							const response = await messagePromise;

							return new Response(\`WebSocket communication successful: \${response}\`, {
								status: 200,
							});
						}

						return new Response("WebSocket upgrade failed", {
							status: 500,
						});
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						// Handle WebSocket upgrade requests
						if (request.headers.get("Upgrade") === "websocket") {
							const [server, client] = Object.values(new WebSocketPair());
							server.accept();

							server.addEventListener("message", (event) => {
								// Echo back with a response to test bidirectional communication
								if (event.data === "ping") {
									server.send("pong");
								}
							});

							return new Response(null, { status: 101, webSocket: client });
						}

						// This test only focuses on WebSocket, no HTTP handling needed
						return new Response("Not a WebSocket request", { status: 400 });
					}
				}
			`),
					},
				},
			],
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://example.com");
				const result = await res.text();
				expect(result).toBe("WebSocket communication successful: pong");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("RPC to default entrypoint", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						try {
	                        const result = await env.SERVICE.ping();
	                        return new Response("Response from remote worker: " + result);
	                    } catch (e) {
	                        return new Response(e.message, { status: 500 });
	                    }
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe(
			`Worker "remote-worker" not found. Make sure it is running locally.`
		);
		expect(res.status).toBe(500);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`),
					},
				},
			],
		});

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: pong");
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Kill the remote worker to see if it fails gracefully
		await remote.dispose();
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe(
					`Worker "remote-worker" not found. Make sure it is running locally.`
				);
				expect(res.status).toBe(500);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("RPC to custom entrypoint", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
	                    try {
	                        const result = await env.SERVICE.ping();
	                        return new Response("Response from remote worker: " + result);
	                    } catch (e) {
	                        return new Response(e.message, { status: 500 });
	                    }
					}
				}
			`),
						env: {
							SERVICE: {
								type: "worker",
								workerName: "remote-worker",
								exportName: "TestEntrypoint",
							},
						},
					},
				},
			],
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe(
			`Worker "remote-worker" not found. Make sure it is running locally.`
		);
		expect(res.status).toBe(500);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				export class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`),
					},
				},
			],
		});

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: pong");
			},
			{ timeout: 10_000, interval: 100 }
		);

		await remote.dispose();
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe(
					`Worker "remote-worker" not found. Make sure it is running locally.`
				);
				expect(res.status).toBe(500);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("service binding props are propagated across instances", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				export class PropsEntrypoint extends WorkerEntrypoint {
					getProps() { return this.ctx.props; }
				}
			`),
					},
				},
			],
		});
		useDispose(remote);
		await remote.ready;

		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env) {
						return Response.json(await env.SERVICE.getProps());
					}
				}
			`),
						env: {
							SERVICE: {
								type: "worker",
								workerName: "remote-worker",
								exportName: "PropsEntrypoint",
								props: { foo: 123, bar: { baz: "hello from props" } },
							},
						},
					},
				},
			],
		});
		useDispose(local);

		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				const json = await res.json();
				expect(res.status).toBe(200);
				expect(json).toEqual({
					foo: 123,
					bar: { baz: "hello from props" },
				});
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to module worker with node bindings", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						return new Response("Not implemented", { status: 501 });
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		const bindings = await local.getBindings<Record<string, any>>();

		await vi.waitFor(
			async () => {
				const res = await bindings.SERVICE.fetch(
					"http://example.com?name=World"
				);
				expect(await res.text()).toBe(
					`Worker "remote-worker" not found. Make sure it is running locally.`
				);
				expect(res.status).toBe(503);
			},
			{ timeout: 10_000, interval: 100 }
		);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
	                    const url = new URL(request.url);
	                    const name = url.searchParams.get("name") ?? 'anonymous';

						return new Response("Hello " + name);
					}
				}
			`),
					},
				},
			],
		});

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await bindings.SERVICE.fetch(
					"http://example.com?name=World"
				);
				const result = await res.text();
				expect(result).toBe("Hello World");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);

		await remote.dispose();
		await vi.waitFor(
			async () => {
				const res = await bindings.SERVICE.fetch(
					"http://example.com?name=World"
				);
				expect(await res.text()).toBe(
					`Worker "remote-worker" not found. Make sure it is running locally.`
				);
				expect(res.status).toBe(503);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("RPC to default entrypoint with node bindings", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						return new Response("Not implemented", { status: 501 });
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		const env = await local.getBindings<Record<string, any>>();

		await vi.waitFor(
			async () => {
				try {
					const result = await env.SERVICE.ping();
					throw new Error(`Expected error, got result: ${result}`);
				} catch (e) {
					expect(e instanceof Error ? e.message : `${e}`).toBe(
						`Worker "remote-worker" not found. Make sure it is running locally.`
					);
				}
			},
			{ timeout: 10_000, interval: 100 }
		);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`),
					},
				},
			],
		});

		await remote.ready;
		await vi.waitFor(
			async () => {
				const result = await env.SERVICE.ping();
				expect(result).toBe("pong");
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Kill the remote worker to see if it fails gracefully
		await remote.dispose();
		await vi.waitFor(
			async () => {
				try {
					const result = await env.SERVICE.ping();
					throw new Error(`Expected error, got result: ${result}`);
				} catch (e) {
					expect(e instanceof Error ? e.message : `${e}`).toBe(
						`Worker "remote-worker" not found. Make sure it is running locally.`
					);
				}
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to durable object with remote running", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					fetch() {
						return new Response('Hello from Durable Object!');
					}
				};

				export default {
					async fetch(request, env, ctx) {
	                    return new Response("Hello from the default Worker Entrypoint!");
					}
				}
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
						exports: {
							MyDurableObject: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			],
		});
		useDispose(remote);

		await remote.ready;

		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
		                const ns = env.DO;
						const id = ns.newUniqueId();
						const stub = ns.get(id);
						return stub.fetch(request);
					}
				}
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
					},
				},
			],
		});
		useDispose(local);

		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Hello from Durable Object!");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("RPC to durable object with remote running", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					ping() {
						return "pong";
					}
				};
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
						exports: {
							MyDurableObject: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			],
		});
		useDispose(remote);

		await remote.ready;

		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						try {
							const ns = env.DO;
							const id = ns.newUniqueId();
							const stub = ns.get(id);
							const result = await stub.ping();

							return new Response(result);
						} catch (ex) {
							return new Response(ex.message, { status: 500 });
						}
					}
				}
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
					},
				},
			],
		});
		useDispose(local);

		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("pong");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to durable object", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
		                const ns = env.DO;
						const id = ns.newUniqueId();
						const stub = ns.get(id);
						const response = await stub.fetch(request);

						return response;
					}
				}
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
					},
				},
			],
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe(
			`Worker "remote-worker" not found. Make sure it is running locally.`
		);
		expect(res.status).toBe(503);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					fetch() {
						return new Response('Hello from Durable Object!');
					}
				};

				export default {
					async fetch(request, env, ctx) {
	                    return new Response("Hello from the default Worker Entrypoint!");
					}
				}
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
						exports: {
							MyDurableObject: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			],
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Hello from Durable Object!");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("RPC to durable object", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						try {
							const ns = env.DO;
							const id = ns.newUniqueId();
							const stub = ns.get(id);
							const result = await stub.ping();

							return new Response("Response from remote worker: " + result);
						} catch (ex) {
							return new Response(ex.message, { status: 500 });
						}
					}
				}
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
					},
				},
			],
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toContain(
			`Worker "remote-worker" not found. Make sure it is running locally.`
		);
		expect(res.status).toBe(500);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					ping() {
						return "pong";
					}
				};
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
						exports: {
							MyDurableObject: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			],
		});
		useDispose(remote);

		await remote.ready;
		// DO RPC now works natively via the debug port
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Response from remote worker: pong");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("workflow with cross-worker scriptName", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2024-11-20",
						env: {
							MY_WORKFLOW: {
								type: "workflow",
								name: "MY_WORKFLOW",
								workerName: "remote-worker",
								exportName: "MyWorkflow",
							},
						},
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						const instance = await env.MY_WORKFLOW.create({ id: "cross-worker-instance" });
						return Response.json({ id: instance.id });
					}
				}
			`),
					},
				},
			],
		});
		useDispose(local);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2024-11-20",
						manifest: singleModuleManifest(`
				import { WorkflowEntrypoint } from "cloudflare:workers";
				export class MyWorkflow extends WorkflowEntrypoint {
					async run(event, step) {
						return await step.do("hello", async () => "from remote workflow");
					}
				}
				export default {
					async fetch() { return new Response("ok"); }
				}
			`),
					},
				},
			],
		});
		useDispose(remote);

		await remote.ready;
		// Workflow `create()` is queued asynchronously by the engine; routing
		// goes engine (local) → ExternalServiceProxy → dev registry → remote
		// MyWorkflow.run. Verify the instance is created with the expected id.
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(res.status).toBe(200);
				expect(await res.json()).toEqual({ id: "cross-worker-instance" });
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("DO RPC survives remote worker restart", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					ping() { return "v1"; }
				}
				export default { fetch() { return new Response("ok"); } }
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
						exports: {
							MyDurableObject: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			],
		});
		useDispose(remote);
		await remote.ready;

		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						// Use idFromName so the same DO instance is reused across requests —
						// this ensures the cached _cachedFetcher is exercised on the second call.
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env) {
						try {
							const id = env.DO.idFromName("stable");
							const stub = env.DO.get(id);
							const result = await stub.ping();
							return new Response("Response: " + result);
						} catch (ex) {
							return new Response(ex.message, { status: 500 });
						}
					}
				}
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
					},
				},
			],
		});
		useDispose(local);

		// First request — caches the fetcher in the DO proxy instance
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Response: v1");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Restart remote — gets a new debug port, registry file updates
		await remote.setOptions({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					ping() { return "v2"; }
				}
				export default { fetch() { return new Response("ok"); } }
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
						exports: {
							MyDurableObject: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			],
		});

		// Second request — same DO instance (idFromName("stable")),
		// but remote debug port has changed. The cached _cachedFetcher
		// points to the old dead connection.
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Response: v2");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("service binding RPC survives remote worker restart", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class extends WorkerEntrypoint {
					ping() { return "v1"; }
				}
			`),
					},
				},
			],
		});
		useDispose(remote);
		await remote.ready;

		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env) {
						try {
							const result = await env.SERVICE.ping();
							return new Response("Response: " + result);
						} catch (e) {
							return new Response(e.message, { status: 500 });
						}
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		// First request — ExternalServiceProxy resolves from registry
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Response: v1");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Restart remote — gets a new debug port, registry file updates
		await remote.setOptions({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class extends WorkerEntrypoint {
					ping() { return "v2"; }
				}
			`),
					},
				},
			],
		});

		// Second request — ExternalServiceProxy is re-instantiated per request,
		// so it reads the updated registry Map and connects to the new debug port.
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Response: v2");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("scheduled to default entrypoint", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			unsafeDevRegistryPath,
			unsafeTriggerHandlers: true,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				let resolve, reject;
				const promise = new Promise((res, rej) => {
					resolve = res;
					reject = rej;
				});
				export default {
					async fetch() {
						try {
							const event = await Promise.race([
								promise,
								new Promise((_, cancel) => setTimeout(cancel, 1000))
							]);
							return Response.json(event);
						} catch {
							return new Response("No scheduled event received", { status: 500 });
						}
					},
					scheduled(e) {
						resolve({ cron: e.cron, scheduledTime: e.scheduledTime });
					}
				};
			`),
					},
				},
			],
		});
		useDispose(remote);
		await remote.ready;

		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env) {
						await env.REMOTE.scheduled({ cron: "*/5 * * * *" });
						return new Response("scheduled event dispatched");
					}
				}
			`),
						env: {
							REMOTE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		// Check scheduled() was dispatched
		await (await local.dispatchFetch("http://placeholder")).text();
		const res = await remote.dispatchFetch("http://placeholder");
		const json = (await res.json()) as { cron: string; scheduledTime: number };
		expect(json).toMatchObject({ cron: "*/5 * * * *" });
		expect(typeof json.scheduledTime).toBe("number");
	});

	test("tail to default entrypoint", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				let resolve, reject;
				const promise = new Promise((res, rej) => {
					resolve = res;
					reject = rej;
				});
				export default {
					async fetch() {
						try {
							const event = await Promise.race([
								promise,
								new Promise((_, cancel) => setTimeout(cancel, 1000))
							]);
							return Response.json(event[0].logs[0].message);
						} catch {
							return new Response("No tail event received", { status: 500 });
						}
					},
					tail(e) {
						resolve(e);
					}
				};
			`),
					},
				},
			],
		});
		useDispose(remote);

		await remote.ready;

		const local = new Miniflare({
			unsafeDevRegistryPath,
			handleStructuredLogs: () => {},
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env) {
						if (request.url.includes("remote-worker")) {
							return env.remote.fetch(request)
						}
						console.log("DevReg: log event")
						return new Response("Hello from local-worker!");
					}
				}
			`),
						tailConsumers: [{ workerName: "remote-worker" }],
						env: {
							remote: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://example.com");
		const result = await res.text();
		expect(result).toBe("Hello from local-worker!");

		const res2 = await local.dispatchFetch("http://example.com/remote-worker");
		const result2 = await res2.text();

		expect(result2).toEqual(`["DevReg: log event"]`);
	});

	test("tail to unknown worker", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const mf = new Miniflare({
			unsafeDevRegistryPath,
			handleStructuredLogs: () => {},
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env) {
						if (request.url.includes("remote-worker")) {
							return env.remote.fetch(request)
						}
						console.log("DevReg: log event 2")
						return new Response("Hello from local-worker!");
					}
				}
			`),
						tailConsumers: [{ workerName: "remote-worker" }],
						env: {
							remote: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://example.com");
		const result = await res.text();
		expect(result).toBe("Hello from local-worker!");

		const res2 = await mf.dispatchFetch("http://example.com/remote-worker");
		const result2 = await res2.text();

		expect(result2).toEqual(
			`Worker "remote-worker" not found. Make sure it is running locally.`
		);
	});

	test("tail consumer props are propagated across instances", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				let resolve;
				const captured = new Promise((res) => { resolve = res; });
				export default {
					async fetch() {
						try {
							const result = await Promise.race([
								captured,
								new Promise((_, cancel) =>
									setTimeout(() => cancel(new Error("no tail event received")), 2000)
								)
							]);
							return Response.json(result);
						} catch (e) {
							return new Response(e.message, { status: 500 });
						}
					}
				};
				export class TailCollector extends WorkerEntrypoint {
					async tail() {
						resolve({ props: this.ctx.props ?? null });
					}
				}
			`),
					},
				},
			],
		});
		useDispose(remote);
		await remote.ready;

		const local = new Miniflare({
			unsafeDevRegistryPath,
			handleStructuredLogs: () => {},
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch() {
						console.log("DevReg: trigger tail event");
						return new Response("ok");
					}
				}
			`),
						tailConsumers: [
							{
								workerName: "remote-worker",
								entrypoint: "TailCollector",
								props: { tailKey: "from-tail-binding" },
							},
						],
					},
				},
			],
		});
		useDispose(local);

		await vi.waitFor(
			async () => {
				// Fire a request that produces a log, which triggers a tail event
				// targeting the remote worker's TailCollector entrypoint.
				const trigger = await local.dispatchFetch("http://example.com");
				expect(await trigger.text()).toBe("ok");

				// Read the captured ctx.props back via the remote's default fetch.
				const res = await remote.dispatchFetch("http://placeholder");
				const json = await res.json();
				expect(res.status).toBe(200);
				expect(json).toEqual({
					props: { tailKey: "from-tail-binding" },
				});
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("miniflare with different registry path", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const unsafeDevRegistryPath2 = await useTmp();
		const localOptions: MiniflareOptions = {
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						try {
	                        const result = await env.SERVICE.ping();
	                        return new Response("Response from remote worker: " + result);
	                    } catch (e) {
	                        return new Response(e.message, { status: 500 });
	                    }
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		};
		const remoteOptions: MiniflareOptions = {
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`),
					},
				},
			],
		};

		const local = new Miniflare({
			...localOptions,
			unsafeDevRegistryPath,
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe(
			`Worker "remote-worker" not found. Make sure it is running locally.`
		);
		expect(res.status).toBe(500);

		const remote = new Miniflare({
			...remoteOptions,
			unsafeDevRegistryPath,
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: pong");
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Change remote's registry path to a different value
		await remote.setOptions({
			...remoteOptions,
			unsafeDevRegistryPath: unsafeDevRegistryPath2,
		});
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe(
					`Worker "remote-worker" not found. Make sure it is running locally.`
				);
				expect(res.status).toBe(500);
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Change local's registry path to the same path as remote's
		await local.setOptions({
			...localOptions,
			unsafeDevRegistryPath: unsafeDevRegistryPath2,
		});
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: pong");
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to module worker with https enabled", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						const response = await env.SERVICE.fetch(request.url);
						const text = await response.text();

						return new Response("Response from remote worker: " + text, {
							status: response.status,
						});
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		const res = await local.dispatchFetch("https://example.com?name=World");

		expect(await res.text()).toBe(
			`Response from remote worker: Worker "remote-worker" not found. Make sure it is running locally.`
		);
		expect(res.status).toBe(503);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			https: true,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
		                const url = new URL(request.url);
		                const name = url.searchParams.get("name") ?? 'anonymous';

						return new Response("Hello " + name);
					}
				}
			`),
					},
					// No direct sockets so that local will connect to the entry worker instead
				},
			],
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("https://example.com?name=World");
				const result = await res.text();
				expect(result).toBe("Response from remote worker: Hello World");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("fetch to durable object with https enabled", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const local = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
		                const ns = env.DO;
						const id = ns.newUniqueId();
						const stub = ns.get(id);
						const response = await stub.fetch(request);

						return response;
					}
				}
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
					},
				},
			],
		});
		useDispose(local);

		const res = await local.dispatchFetch("http://placeholder");
		expect(await res.text()).toBe(
			`Worker "remote-worker" not found. Make sure it is running locally.`
		);
		expect(res.status).toBe(503);

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			https: true,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					fetch() {
						return new Response('Hello from Durable Object!');
					}
				};

				export default {
					async fetch(request, env, ctx) {
	                    return new Response("Hello from the default Worker Entrypoint!");
					}
				}
			`),
						env: {
							DO: {
								type: "durable-object",
								workerName: "remote-worker",
								exportName: "MyDurableObject",
							},
						},
						exports: {
							MyDurableObject: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			],
		});
		useDispose(remote);

		await remote.ready;
		await vi.waitFor(
			async () => {
				const res = await local.dispatchFetch("http://placeholder");
				expect(await res.text()).toBe("Hello from Durable Object!");
				expect(res.status).toBe(200);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("handleDevRegistryUpdate callback", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const firstCallbackInvocations: Array<{
			registry: WorkerRegistry;
		}> = [];
		const secondCallbackInvocations: Array<{
			registry: WorkerRegistry;
		}> = [];

		// Create local Worker with service binding and callback
		const local = new Miniflare({
			unsafeDevRegistryPath,
			unsafeHandleDevRegistryUpdate(registry) {
				firstCallbackInvocations.push({ registry });
			},
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						try {
							const result = await env.SERVICE.ping();
							return new Response("Response from remote Worker: " + result);
						} catch (e) {
							return new Response(e.message, { status: 500 });
						}
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});
		useDispose(local);

		// Callback should not be triggered initially since no external services exist
		expect(firstCallbackInvocations.length).toBe(0);
		expect(secondCallbackInvocations.length).toBe(0);

		// Create an unrelated Worker - callback should NOT be triggered
		const unrelated = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "unrelated-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch() {
						return new Response("Hello from unrelated-worker!");
					}
				}
			`),
					},
				},
			],
		});
		useDispose(unrelated);

		await unrelated.ready;

		// Callback should not be triggered since we're not bound to unrelated-worker
		expect(firstCallbackInvocations.length).toBe(0);
		expect(secondCallbackInvocations.length).toBe(0);

		// Create remote worker (one we're actually bound to) - this should trigger the callback
		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class TestEntrypoint extends WorkerEntrypoint {
					ping() { return "pong"; }
				}
			`),
					},
				},
			],
		});
		onTestFinished(async () => {
			try {
				await remote.dispose();
			} catch {
				// Ignore if already disposed
			}
		});

		await remote.ready;

		// Wait for the callback to be triggered
		await vi.waitFor(
			async () => {
				// Callback should be triggered when bound Worker starts
				expect(firstCallbackInvocations.length).toBe(1);
				// Second callback should not be triggered yet
				expect(secondCallbackInvocations.length).toBe(0);
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Verify the callback was called with the correct registry data
		await vi.waitFor(
			async () => {
				const latestInvocation = firstCallbackInvocations.at(-1);
				// Registry should contain remote-worker
				expect(latestInvocation?.registry["remote-worker"]).toBeDefined();
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Update unsafeHandleDevRegistryUpdate callback to push to a different array
		await local.setOptions({
			unsafeDevRegistryPath,
			unsafeHandleDevRegistryUpdate(registry) {
				secondCallbackInvocations.push({
					registry,
				});
			},
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					async fetch(request, env, ctx) {
						try {
							const result = await env.SERVICE.ping();
							return new Response("Response from updated local Worker: " + result);
						} catch (e) {
							return new Response(e.message, { status: 500 });
						}
					}
				}
			`),
						env: {
							SERVICE: { type: "worker", workerName: "remote-worker" },
						},
					},
				},
			],
		});

		// Test disposal
		await remote.dispose();

		// Wait for callback to be triggered by the update
		await vi.waitFor(
			async () => {
				// First callback should not be triggered again after update
				expect(firstCallbackInvocations.length).toBe(1);
				// Second callback should be triggered after update
				expect(secondCallbackInvocations.length).toBe(1);
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Verify if the remote worker is no longer in the registry
		await vi.waitFor(
			async () => {
				const latestInvocation = secondCallbackInvocations.at(-1);
				// Registry should not contain remote-worker
				expect(latestInvocation?.registry["remote-worker"]).toBeUndefined();
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("advertises consumed queues in the worker's registry entry", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();

		const mf = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "consumer-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(
							`export default { async queue() {} }`
						),
						// Consumed queues are advertised on the worker's own registry entry
						// so producers in other processes can resolve this process's broker.
						triggers: [{ type: "queue", name: "my-queue" }],
					},
				},
			],
		});
		useDispose(mf);
		await mf.ready;

		await vi.waitFor(
			() => {
				const registry = getWorkerRegistry(unsafeDevRegistryPath);
				expect(registry["consumer-worker"]?.queueConsumers).toEqual([
					"my-queue",
				]);
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Remove the consumer on reload so its advertisement is withdrawn and
		// doesn't misdirect producers.
		await mf.setOptions({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "consumer-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(
							`export default { async fetch() { return new Response("ok"); } }`
						),
					},
				},
			],
		});

		await vi.waitFor(
			() => {
				const registry = getWorkerRegistry(unsafeDevRegistryPath);
				// The worker's own entry is still advertised, without the queue.
				expect(registry["consumer-worker"]).toBeDefined();
				expect(registry["consumer-worker"].queueConsumers).toBeUndefined();
			},
			{ timeout: 10_000, interval: 100 }
		);
	});
	test("reports a failure to forward tail events to a departed peer", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();

		const remote = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "remote-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				import { WorkerEntrypoint } from "cloudflare:workers";
				export default class extends WorkerEntrypoint {
					tail() {}
				}
			`),
					},
				},
			],
		});
		useDispose(remote);
		await remote.ready;

		const logs: string[] = [];
		const local = new Miniflare({
			unsafeDevRegistryPath,
			handleStructuredLogs: ({ message }) => void logs.push(message),
			workers: [
				{
					config: {
						type: "worker",
						name: "local-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
				export default {
					fetch() {
						console.log("tail me");
						return new Response("ok");
					}
				}
			`),
						tailConsumers: [{ workerName: "remote-worker" }],
					},
				},
			],
		});
		useDispose(local);
		await local.ready;

		// Establish the tail forwarding path while the peer is alive.
		await vi.waitFor(
			async () => {
				await (await local.dispatchFetch("http://placeholder")).text();
				expect(logs.join("\n")).toContain("tail me");
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Drop the peer without letting it deregister, so `local` keeps a registry
		// entry pointing at a debug port that is no longer accepting connections.
		// The forwarding RPC now rejects; that rejection must be reported rather
		// than escaping as an unhandled rejection.
		await remote.dispose();
		logs.length = 0;

		await vi.waitFor(
			async () => {
				await (await local.dispatchFetch("http://placeholder")).text();
				expect(logs.join("\n")).toContain(
					`[dev-registry] Failed to forward tail events to "remote-worker"`
				);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});
});

describe("registry churn across config updates", () => {
	const script = (body: string) =>
		`export default { async fetch() { return new Response("${body}"); } }`;
	const worker = (name: string, body: string, compatibilityFlags?: string[]) =>
		({
			dev: { unsafeRegisterWorker: true },
			config: {
				type: "worker",
				name,
				compatibilityDate: "2025-05-01",
				compatibilityFlags,
				manifest: singleModuleManifest(script(body)),
			},
		}) satisfies MiniflareOptions["workers"][number];

	test("does not withdraw a Worker's entry during an unrelated config update", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const mf = new Miniflare({
			unsafeDevRegistryPath,
			workers: [worker("stable-worker", "before")],
		});
		useDispose(mf);
		await mf.ready;

		await vi.waitFor(
			() => {
				expect(
					getWorkerRegistry(unsafeDevRegistryPath)["stable-worker"]
				).toBeDefined();
			},
			{ timeout: 10_000, interval: 100 }
		);

		// Other dev sessions learn about us by watching this directory, so watch it
		// the same way and record what a peer would actually see.
		const events: string[] = [];
		const watcher = watch(unsafeDevRegistryPath, {
			ignoreInitial: true,
		});
		onTestFinished(() => watcher.close());
		await new Promise((resolve) => watcher.once("ready", resolve));
		watcher.on("unlink", (file) =>
			events.push(`unlink:${path.basename(file)}`)
		);
		watcher.on("add", (file) => events.push(`add:${path.basename(file)}`));
		watcher.on("change", (file) =>
			events.push(`change:${path.basename(file)}`)
		);

		await mf.setOptions({
			unsafeDevRegistryPath,
			workers: [worker("stable-worker", "after")],
		});

		// Wait until the update has definitely reached the directory, so that an
		// empty event list can't be mistaken for a passing assertion.
		await vi.waitFor(
			() => {
				expect(events.some((event) => event.endsWith(":stable-worker"))).toBe(
					true
				);
			},
			{ timeout: 10_000, interval: 100 }
		);

		expect(events).not.toContain("unlink:stable-worker");
		expect(
			getWorkerRegistry(unsafeDevRegistryPath)["stable-worker"]
		).toBeDefined();
	});

	test("withdraws its entries when a config update fails to start a runtime", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const mf = new Miniflare({
			unsafeDevRegistryPath,
			workers: [worker("doomed-worker", "before")],
		});
		useDispose(mf);
		await mf.ready;

		await vi.waitFor(
			() => {
				expect(
					getWorkerRegistry(unsafeDevRegistryPath)["doomed-worker"]
				).toBeDefined();
			},
			{ timeout: 10_000, interval: 100 }
		);

		// A flag `workerd` rejects. The previous runtime is stopped before the
		// replacement is started, so this update leaves no runtime behind it.
		await expect(
			mf.setOptions({
				unsafeDevRegistryPath,
				workers: [
					worker("doomed-worker", "after", [
						"definitely_not_a_real_compatibility_flag",
					]),
				],
			})
		).rejects.toThrow(/runtime failed to start/i);

		// Nothing serves the advertised debug port now, and the entry's heartbeat
		// would keep it looking fresh, so it has to be withdrawn rather than left
		// for the stale-entry sweep.
		expect(
			getWorkerRegistry(unsafeDevRegistryPath)["doomed-worker"]
		).toBeUndefined();
	});

	test("withdraws a removed Worker named after an inherited property", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const mf = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				worker("kept-worker", "kept"),
				// A name that exists on `Object.prototype`, so a membership test that
				// walks the prototype chain would report it as still configured.
				worker("constructor", "dropped"),
			],
		});
		useDispose(mf);
		await mf.ready;

		// `hasOwn` throughout: a plain object resolves `registry["constructor"]`
		// through its prototype, so a plain lookup would assert nothing here.
		await vi.waitFor(
			() => {
				expect(
					Object.hasOwn(getWorkerRegistry(unsafeDevRegistryPath), "constructor")
				).toBe(true);
			},
			{ timeout: 10_000, interval: 100 }
		);

		await mf.setOptions({
			unsafeDevRegistryPath,
			workers: [worker("kept-worker", "kept")],
		});

		await vi.waitFor(
			() => {
				const registry = getWorkerRegistry(unsafeDevRegistryPath);
				expect(registry["kept-worker"]).toBeDefined();
				expect(Object.hasOwn(registry, "constructor")).toBe(false);
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("withdraws the entry for a Worker removed from the config", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const mf = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				worker("kept-worker", "kept"),
				worker("dropped-worker", "dropped"),
			],
		});
		useDispose(mf);
		await mf.ready;

		await vi.waitFor(
			() => {
				const registry = getWorkerRegistry(unsafeDevRegistryPath);
				expect(registry["kept-worker"]).toBeDefined();
				expect(registry["dropped-worker"]).toBeDefined();
			},
			{ timeout: 10_000, interval: 100 }
		);

		await mf.setOptions({
			unsafeDevRegistryPath,
			workers: [worker("kept-worker", "kept")],
		});

		await vi.waitFor(
			() => {
				const registry = getWorkerRegistry(unsafeDevRegistryPath);
				expect(registry["kept-worker"]).toBeDefined();
				expect(registry["dropped-worker"]).toBeUndefined();
			},
			{ timeout: 10_000, interval: 100 }
		);
	});
});
