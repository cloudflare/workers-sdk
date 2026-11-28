import events from "node:events";
import http from "node:http";
import net from "node:net";
import { setTimeout } from "node:timers/promises";
import { fetch, LogLevel, Miniflare, MiniflareCoreError } from "miniflare";
import { beforeAll, type ExpectStatic, test, vi } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { InspectorProxyController } from "../../../../src/plugins/core/inspector-proxy";
import { InspectorProxy } from "../../../../src/plugins/core/inspector-proxy/inspector-proxy";
import {
	singleModuleManifest,
	TestLog,
	useDispose,
} from "../../../test-shared";
import type { MiniflareOptions } from "miniflare";

const nullScript =
	'addEventListener("fetch", (event) => event.respondWith(new Response(null, { status: 404 })));';

beforeAll(() => {
	// the tests in this file don't immediately consume bodies of fetch requests (since they
	// test the debugging/inspector behavior), so we need to skip the bodies check by
	// setting process.env.MINIFLARE_ASSERT_BODIES_CONSUMED to undefined
	process.env.MINIFLARE_ASSERT_BODIES_CONSUMED = undefined;
});

test("InspectorProxy: removes startup error handler after listening", async ({
	expect,
	onTestFinished,
}) => {
	const off = vi.spyOn(http.Server.prototype, "off");
	const log = new TestLog();
	const logError = vi.spyOn(log, "error").mockImplementation(() => {});
	const controller = new InspectorProxyController(
		0,
		"127.0.0.1",
		log,
		new Set()
	);
	onTestFinished(async () => {
		await controller.dispose();
		off.mockRestore();
		logError.mockRestore();
	});

	await controller.getInspectorURL();

	expect(off).toHaveBeenCalledWith("error", expect.any(Function));
	const errorListenerRemovalIndex = off.mock.calls.findIndex(
		([event]) => event === "error"
	);
	const server = off.mock.instances[errorListenerRemovalIndex] as http.Server;
	expect(server.listenerCount("error")).toBe(1);

	const error = new Error("test error");
	server.emit("error", error);
	expect(logError).toHaveBeenCalledWith(error);
});

test("InspectorProxy: closes server and preserves bind failure", async ({
	expect,
	onTestFinished,
}) => {
	const close = vi.spyOn(http.Server.prototype, "close");
	onTestFinished(() => close.mockRestore());
	const controller = new InspectorProxyController(
		0,
		"192.0.2.1",
		new TestLog(),
		new Set()
	);

	await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
	const bindError = await controller.ready.catch((error: unknown) => error);
	expect(bindError).toMatchObject({
		address: "192.0.2.1",
		syscall: "listen",
	});
	await expect(controller.getInspectorURL()).rejects.toBe(bindError);
	await expect(controller.dispose()).rejects.toBe(bindError);
	expect(close).toHaveBeenCalledOnce();
});

test("InspectorProxy: keeps serving, and can retry, when a new port fails to bind", async ({
	expect,
	onTestFinished,
}) => {
	const blocker = net.createServer();
	const blockedPort = await listenOnRandomPort(blocker);
	onTestFinished(() => closeServer(blocker));
	// Stands in for workerd's inspector, which lists no workers
	const runtime = http.createServer((_req, res) => res.end("[]"));
	const runtimePort = await listenOnRandomPort(runtime);
	onTestFinished(() => closeServer(runtime));
	const controller = new InspectorProxyController(
		0,
		"127.0.0.1",
		new TestLog(),
		new Set()
	);
	onTestFinished(() => controller.dispose());
	const url = await controller.getInspectorURL();

	const update = (port: number) =>
		controller.updateConnection(port, "127.0.0.1", runtimePort, new Set());
	await expect(update(blockedPort)).rejects.toMatchObject({
		code: "EADDRINUSE",
	});
	expect(await controller.getInspectorURL()).toEqual(url);
	const res = await fetch(`http://${url.host}/json/version`);
	expect(res.status).toBe(200);

	// A retry tries to listen again, rather than failing on the old state
	await expect(update(blockedPort)).rejects.toMatchObject({
		code: "EADDRINUSE",
	});
	await update(0);
	expect(await controller.getInspectorURL()).toEqual(url);
});

test("InspectorProxy: propagates bind failure through Miniflare", async ({
	expect,
}) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		inspectorHost: "192.0.2.1",
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
		],
	});

	const bindError = await mf.ready.catch((error: unknown) => error);
	expect(bindError).toMatchObject({
		address: "192.0.2.1",
		syscall: "listen",
	});
	await expect(mf.getInspectorURL()).rejects.toBe(bindError);
	await expect(mf.dispose()).rejects.toBe(bindError);
});

test("InspectorProxy: handles the runtime resetting its connection", async ({
	expect,
	onTestFinished,
}) => {
	// Miniflare kills workerd whenever it restarts or is disposed, which can
	// reset the proxy's connection to workerd's inspector
	const runtime = net.createServer((socket) => socket.resetAndDestroy());
	const port = await listenOnRandomPort(runtime);
	onTestFinished(() => closeServer(runtime));
	const log = new TestLog();
	const runtimeWs = new WebSocket(`ws://127.0.0.1:${port}`);
	const proxy = new InspectorProxy(log, "worker", runtimeWs);

	await new Promise((resolve) => runtimeWs.once("close", resolve));
	// The reset surfaces as EPIPE instead if it lands while the handshake is
	// still being written
	expect(log.logsAtLevel(LogLevel.DEBUG)).toContainEqual(
		expect.stringMatching(/ECONNRESET|EPIPE/)
	);
	await proxy.dispose();
});

test("InspectorProxy: can be disposed before the runtime connection opens", async ({
	expect,
	onTestFinished,
}) => {
	// Accept connections, but never answer the WebSocket handshake
	const sockets = new Set<net.Socket>();
	const runtime = net.createServer((socket) => sockets.add(socket));
	const port = await listenOnRandomPort(runtime);
	onTestFinished(() => {
		sockets.forEach((socket) => socket.destroy());
		return closeServer(runtime);
	});
	const log = new TestLog();
	const runtimeWs = new WebSocket(`ws://127.0.0.1:${port}`);
	const proxy = new InspectorProxy(log, "worker", runtimeWs);
	await vi.waitFor(() => expect(sockets.size).toBe(1));

	await proxy.dispose();
	await new Promise((resolve) => runtimeWs.once("close", resolve));
	expect(log.logsAtLevel(LogLevel.DEBUG)).toContainEqual(
		expect.stringContaining("closed before the connection was established")
	);
});

test("InspectorProxy: forwards DevTools messages sent before the runtime connection opens", async ({
	expect,
	onTestFinished,
}) => {
	// Hold the runtime's WebSocket handshake until DevTools has sent a message
	let acceptRuntime = () => {};
	const runtimeAccepted = new Promise<void>((resolve) => {
		acceptRuntime = resolve;
	});
	const runtime = new WebSocketServer({
		host: "127.0.0.1",
		port: 0,
		verifyClient: (_info, callback) =>
			void runtimeAccepted.then(() => callback(true)),
	});
	const devtools = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	await Promise.all([
		events.once(runtime, "listening"),
		events.once(devtools, "listening"),
	]);
	onTestFinished(() => {
		runtime.clients.forEach((client) => client.terminate());
		devtools.clients.forEach((client) => client.terminate());
		runtime.close();
		devtools.close();
	});
	const runtimePort = (runtime.address() as net.AddressInfo).port;
	const devtoolsPort = (devtools.address() as net.AddressInfo).port;
	const proxy = new InspectorProxy(
		new TestLog(),
		"worker",
		new WebSocket(`ws://127.0.0.1:${runtimePort}`)
	);
	onTestFinished(() => proxy.dispose());

	const devtoolsClient = new WebSocket(`ws://127.0.0.1:${devtoolsPort}`);
	const devtoolsClientOpen = events.once(devtoolsClient, "open");
	const [devtoolsWs] = (await events.once(devtools, "connection")) as [
		WebSocket,
	];
	proxy.onDevtoolsConnected(devtoolsWs, true);
	await devtoolsClientOpen;
	const message = { id: 1, method: "Debugger.enable" };
	devtoolsClient.send(JSON.stringify(message));
	await events.once(devtoolsWs, "message");

	const runtimeConnection = events.once(runtime, "connection");
	acceptRuntime();
	const [runtimeWs] = (await runtimeConnection) as [WebSocket];
	const [data] = (await events.once(runtimeWs, "message")) as [Buffer];
	expect(JSON.parse(data.toString())).toEqual(message);
});

test("InspectorProxy: /json/version should provide details about the inspector version", async ({
	expect,
}) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
		],
	});
	useDispose(mf);

	const host = await getInspectorHostReady(mf);

	const res = await fetch(`http://${host}/json/version`);
	expect(res.headers.get("content-type")).toBe("application/json");

	const versionDetails = (await res.json()) as Record<string, string>;

	expect(versionDetails["Browser"]).toMatch(
		/^miniflare\/v\d\.\d{8}\.\d+(-\w+)?$/
	);
	expect(versionDetails["Protocol-Version"]).toMatch(/^\d+\.\d+$/);
});

test("InspectorProxy: /json should provide a list of a single worker inspector", async ({
	expect,
}) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
		],
	});
	useDispose(mf);

	const host = await getInspectorHostReady(mf);

	const res = await fetch(`http://${host}/json`);
	const inspectors = (await res.json()) as Record<string, string>[];

	expect(res.headers.get("content-type")).toBe("application/json");

	expect(inspectors.length).toBe(1);

	expect(inspectors[0]["description"]).toBe("workers");
	expect(inspectors[0]["title"]).toBe("Cloudflare Worker");
	expect(inspectors[0]["webSocketDebuggerUrl"]).toBe(`ws://${host}/`);
});

test("InspectorProxy: proxy port validation", async ({ expect }) => {
	expect(
		() =>
			new Miniflare({
				workers: [
					{
						config: {
							name: "",
							compatibilityDate: "2025-05-01",
						},
						legacy: { serviceWorkerScript: nullScript },
						dev: { unsafeInspectorProxy: true },
					},
				],
			})
	).toThrow(
		new MiniflareCoreError(
			"ERR_MISSING_INSPECTOR_PROXY_PORT",
			"inspector proxy requested but without an inspectorPort specified"
		)
	);
});

test("InspectorProxy: /json should provide a list of a multiple worker inspector", async ({
	expect,
}) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
			{
				config: {
					name: "extra-worker-a",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
			{
				config: {
					name: "extra-worker-b",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
		],
	});
	useDispose(mf);

	const host = await getInspectorHostReady(mf);

	const res = await fetch(`http://${host}/json`);
	expect(res.headers.get("content-type")).toBe("application/json");

	const inspectors = (await res.json()) as Record<string, string>[];

	expect(inspectors.length).toBe(3);

	expect(inspectors[0]["description"]).toBe("workers");
	expect(inspectors[0]["title"]).toBe("Cloudflare Worker");
	expect(inspectors[0]["webSocketDebuggerUrl"]).toBe(`ws://${host}/`);
	expect(inspectors[1]["description"]).toBe("workers");
	expect(inspectors[1]["title"]).toBe("Cloudflare Worker: extra-worker-a");
	expect(inspectors[1]["webSocketDebuggerUrl"]).toBe(
		`ws://${host}/extra-worker-a`
	);
	expect(inspectors[2]["description"]).toBe("workers");
	expect(inspectors[2]["title"]).toBe("Cloudflare Worker: extra-worker-b");
	expect(inspectors[2]["webSocketDebuggerUrl"]).toBe(
		`ws://${host}/extra-worker-b`
	);
});

test("InspectorProxy: /json should provide a list of a multiple worker inspector with some filtered out", async ({
	expect,
}) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
			{
				config: {
					name: "extra-worker-a",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
			},
			{
				config: {
					name: "extra-worker-b",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
		],
	});
	useDispose(mf);

	const host = await getInspectorHostReady(mf);

	const res = await fetch(`http://${host}/json`);
	expect(res.headers.get("content-type")).toBe("application/json");

	const inspectors = (await res.json()) as Record<string, string>[];

	expect(inspectors.length).toBe(2);

	expect(inspectors[0]["description"]).toBe("workers");
	expect(inspectors[0]["title"]).toBe("Cloudflare Worker");
	expect(inspectors[0]["webSocketDebuggerUrl"]).toBe(`ws://${host}/`);
	expect(inspectors[1]["description"]).toBe("workers");
	expect(inspectors[1]["title"]).toBe("Cloudflare Worker: extra-worker-b");
	expect(inspectors[1]["webSocketDebuggerUrl"]).toBe(
		`ws://${host}/extra-worker-b`
	);
});

test("InspectorProxy: should allow inspector port updating via miniflare#setOptions", async ({
	expect,
}) => {
	const options: MiniflareOptions = {
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
		],
	};
	const mf = new Miniflare({ ...options, inspectorPort: 0 });
	useDispose(mf);

	const initialHost = await useFixedInspectorPort(mf, options);

	let res = await fetch(`http://${initialHost}/json/version`);
	expect(res.status).toBe(200);

	await mf.setOptions({ ...options, inspectorPort: 0 });

	const newHost = await getInspectorHostReady(mf);
	expect(newHost).not.toBe(initialHost);

	res = await fetch(`http://${newHost}/json/version`);
	expect(res.status).toBe(200);

	await vi.waitFor(
		async () => {
			try {
				await fetch(`http://${initialHost}/json/version`);
				// Old inspector port still responding
				throw new Error("Old inspector port still responding");
			} catch (e) {
				// If it's our error, rethrow it
				if (
					e instanceof Error &&
					e.message === "Old inspector port still responding"
				) {
					throw e;
				}
				// Otherwise, the port is no longer responding (which is what we want)
			}
		},
		{ timeout: 10_000, interval: 100 }
	);
});

test("InspectorProxy: should keep the same inspector port on miniflare#setOptions calls with inspectorPort set to 0", async ({
	expect,
}) => {
	const options: MiniflareOptions = {
		inspectorPort: 0,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
		],
	};
	const mf = new Miniflare(options);
	useDispose(mf);

	const oldHost = await getInspectorHostReady(mf);

	await mf.setOptions({ ...options, cf: false });

	const newHost = await getInspectorHostReady(mf);

	expect(oldHost).toBe(newHost);
});

test("InspectorProxy: should not keep the same inspector port on miniflare#setOptions calls changing inspectorPort to 0", async ({
	expect,
}) => {
	const options: MiniflareOptions = {
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
				},
				legacy: { serviceWorkerScript: nullScript },
				dev: { unsafeInspectorProxy: true },
			},
		],
	};
	const mf = new Miniflare({ ...options, inspectorPort: 0 });
	useDispose(mf);

	const initialHost = await useFixedInspectorPort(mf, options);

	await mf.setOptions({ ...options, inspectorPort: 0 });
	const newHost = await getInspectorHostReady(mf);

	expect(initialHost).not.toBe(newHost);

	const res = await fetch(`http://${newHost}/json/version`);
	expect(res.status).toBe(200);

	await expect(fetch(`http://${initialHost}/json/version`)).rejects.toThrow();
});

test("InspectorProxy: should allow debugging a single worker", async ({
	expect,
}) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("body");
							}
						}
					`),
				},
				dev: { unsafeInspectorProxy: true },
			},
		],
	});
	useDispose(mf);

	const host = await getInspectorHostReady(mf);

	// Connect inspector WebSocket
	const ws = new WebSocket(`ws://${host}`);
	const messages = events.on(ws, "message");
	async function nextMessage() {
		const messageEvent = (await messages.next()).value;
		return JSON.parse(messageEvent[0].toString());
	}

	await events.once(ws, "open");

	ws.send(JSON.stringify({ id: 0, method: "Debugger.enable" }));

	expect(await nextMessagesUntilResponse(nextMessage, 0)).toContainEqual(
		userScriptParsedEvent(expect)
	);

	// Send request and hit `debugger;` statement
	const resPromise = mf.dispatchFetch("http://localhost");
	expect(await nextMessage()).toMatchObject({ method: "Debugger.paused" });

	// Resume execution
	ws.send(JSON.stringify({ id: 1, method: "Debugger.resume" }));

	expect(await nextMessage()).toMatchObject({ id: 1 });

	expect(await nextMessage()).toMatchObject({ method: "Debugger.resumed" });

	const res = await resPromise;
	expect(await res.text()).toBe("body");
});

test("InspectorProxy: the devtools websocket communication should adapt to an inspector port changes in a miniflare#setOptions calls", async ({
	expect,
}) => {
	const options: MiniflareOptions = {
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("body");
							}
						}
					`),
				},
				dev: { unsafeInspectorProxy: true },
			},
		],
	};
	const mf = new Miniflare({ ...options, inspectorPort: 0 });
	useDispose(mf);

	const testDebuggingWorkerOn = async (host: string) => {
		// Connect inspector WebSocket
		const ws = new WebSocket(`ws://${host}`);
		const messages = events.on(ws, "message");
		async function nextMessage() {
			const messageEvent = (await messages.next()).value;
			return JSON.parse(messageEvent[0].toString());
		}

		await events.once(ws, "open");

		ws.send(JSON.stringify({ id: 0, method: "Debugger.enable" }));

		expect(await nextMessagesUntilResponse(nextMessage, 0)).toContainEqual(
			userScriptParsedEvent(expect)
		);

		// Send request and hit `debugger;` statement
		const resPromise = mf.dispatchFetch("http://localhost");
		expect(await nextMessage()).toMatchObject({ method: "Debugger.paused" });

		// Resume execution
		ws.send(JSON.stringify({ id: 1, method: "Debugger.resume" }));

		expect(await nextMessage()).toMatchObject({ id: 1 });

		expect(await nextMessage()).toMatchObject({ method: "Debugger.resumed" });

		const res = await resPromise;
		expect(await res.text()).toBe("body");

		ws.close();
	};

	const initialHost = await useFixedInspectorPort(mf, options);

	await testDebuggingWorkerOn(initialHost);

	await mf.setOptions({ ...options, inspectorPort: 0 });

	const newHost = await getInspectorHostReady(mf);

	expect(initialHost).not.toBe(newHost);

	await testDebuggingWorkerOn(newHost);
});

test("InspectorProxy: should allow debugging multiple workers", async ({
	expect,
}) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				config: {
					name: "worker-a",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export default {
							async fetch(request, env, ctx) {
								debugger;
								const workerBText = await env['WORKER_B'].fetch(request).then(resp => resp.text());
								debugger;
								return new Response(\`worker-a -> \${workerBText}\`);
							}
						}
					`),
					env: {
						WORKER_B: { type: "worker", worker: "worker-b" },
					},
				},
				dev: { unsafeInspectorProxy: true },
			},
			{
				config: {
					name: "worker-b",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("worker-b");
							}
						}
					`),
				},
				dev: { unsafeInspectorProxy: true },
			},
		],
	});
	useDispose(mf);

	const host = await getInspectorHostReady(mf);

	// Connect inspector WebSockets
	const webSockets = {
		["worker-a"]: new WebSocket(`ws://${host}/worker-a`),
		["worker-b"]: new WebSocket(`ws://${host}/worker-b`),
	};
	const messages = {
		["worker-a"]: events.on(webSockets["worker-a"], "message"),
		["worker-b"]: events.on(webSockets["worker-b"], "message"),
	};

	type Worker = keyof typeof webSockets;

	async function nextMessage(worker: Worker) {
		const messageEvent = (await messages[worker].next()).value;
		return JSON.parse(messageEvent[0].toString());
	}

	await Promise.all([
		events.once(webSockets["worker-a"], "open"),
		events.once(webSockets["worker-b"], "open"),
	]);

	Object.values(webSockets).forEach((ws) =>
		ws.send(JSON.stringify({ id: 0, method: "Debugger.enable" }))
	);

	const waitForScriptParsed = async (worker: Worker) => {
		expect(
			await nextMessagesUntilResponse(() => nextMessage(worker), 0)
		).toContainEqual(userScriptParsedEvent(expect));
	};

	await waitForScriptParsed("worker-a");
	await waitForScriptParsed("worker-b");

	// Send request and hit `debugger;` statements
	const resPromise = mf.dispatchFetch("http://localhost");
	expect(await nextMessage("worker-a")).toMatchObject({
		method: "Debugger.paused",
	});

	const resumeWorker = async (worker: Worker) => {
		const id = Math.floor(Math.random() * 50_000);
		webSockets[worker].send(JSON.stringify({ id, method: "Debugger.resume" }));
		expect(await nextMessage(worker)).toMatchObject({ id });
		expect(await nextMessage(worker)).toMatchObject({
			method: "Debugger.resumed",
		});
	};

	// Resume execution (first worker-a debugger)
	await resumeWorker("worker-a");

	expect(await nextMessage("worker-b")).toMatchObject({
		method: "Debugger.paused",
	});

	// Resume execution (worker-b debugger)
	await resumeWorker("worker-b");

	// There are a few network messages send due to the communication from worker-b back
	// to worker-a, these are not too relevant to test, so we just consume them until we
	// hit the next worker-a debugger
	while (true) {
		const nextMessageWorkerA = await nextMessage("worker-a");
		const messageMethod = nextMessageWorkerA.method;
		if (
			typeof messageMethod === "string" &&
			messageMethod.startsWith("Network.")
		) {
			continue;
		}

		expect(nextMessageWorkerA).toMatchObject({ method: "Debugger.paused" });
		break;
	}

	// Resume execution (second worker-a debugger)
	await resumeWorker("worker-a");

	const res = await resPromise;
	expect(await res.text()).toBe("worker-a -> worker-b");
});

test("InspectorProxy: should allow debugging workers created via setOptions", async ({
	expect,
}) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				config: {
					name: "worker-b",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("worker-b");
							}
						}
					`),
				},
				dev: { unsafeInspectorProxy: true },
			},
		],
	});
	useDispose(mf);

	await mf.ready;

	await mf.setOptions({
		inspectorPort: 0,
		workers: [
			{
				config: {
					name: "worker-a",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export default {
							async fetch(request, env, ctx) {
								debugger;
								const workerBText = await env['WORKER_B'].fetch(request).then(resp => resp.text());
								debugger;
								return new Response(\`worker-a -> \${workerBText}\`);
							}
						}
					`),
					env: {
						WORKER_B: { type: "worker", worker: "worker-b" },
					},
				},
				dev: { unsafeInspectorProxy: true },
			},
			{
				config: {
					name: "worker-b",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("worker-b");
							}
						}
					`),
				},
				dev: { unsafeInspectorProxy: true },
			},
		],
	});

	const host = await getInspectorHostReady(mf);

	// Connect inspector WebSockets
	const webSockets = {
		["worker-a"]: new WebSocket(`ws://${host}/worker-a`),
		["worker-b"]: new WebSocket(`ws://${host}/worker-b`),
	};
	const messages = {
		["worker-a"]: events.on(webSockets["worker-a"], "message"),
		["worker-b"]: events.on(webSockets["worker-b"], "message"),
	};

	type Worker = keyof typeof webSockets;

	async function nextMessage(worker: Worker) {
		const messageEvent = (await messages[worker].next()).value;
		return JSON.parse(messageEvent[0].toString());
	}

	await Promise.all([
		events.once(webSockets["worker-a"], "open"),
		events.once(webSockets["worker-b"], "open"),
	]);

	Object.values(webSockets).forEach((ws) =>
		ws.send(JSON.stringify({ id: 0, method: "Debugger.enable" }))
	);

	const waitForScriptParsed = async (worker: Worker) => {
		expect(
			await nextMessagesUntilResponse(() => nextMessage(worker), 0)
		).toContainEqual(userScriptParsedEvent(expect));
	};

	await waitForScriptParsed("worker-a");
	await waitForScriptParsed("worker-b");

	// Send request and hit `debugger;` statements
	const resPromise = mf.dispatchFetch("http://localhost");
	expect(await nextMessage("worker-a")).toMatchObject({
		method: "Debugger.paused",
	});

	const resumeWorker = async (worker: Worker) => {
		const id = Math.floor(Math.random() * 50_000);
		webSockets[worker].send(JSON.stringify({ id, method: "Debugger.resume" }));
		expect(await nextMessage(worker)).toMatchObject({ id });
		expect(await nextMessage(worker)).toMatchObject({
			method: "Debugger.resumed",
		});
	};

	// Resume execution (first worker-a debugger)
	await resumeWorker("worker-a");

	expect(await nextMessage("worker-b")).toMatchObject({
		method: "Debugger.paused",
	});

	// Resume execution (worker-b debugger)
	await resumeWorker("worker-b");

	// There are a few network messages send due to the communication from worker-b back
	// to worker-a, these are not too relevant to test, so we just consume them until we
	// hit the next worker-a debugger
	while (true) {
		const nextMessageWorkerA = await nextMessage("worker-a");
		const messageMethod = nextMessageWorkerA.method;
		if (
			typeof messageMethod === "string" &&
			messageMethod.startsWith("Network.")
		) {
			continue;
		}

		expect(nextMessageWorkerA).toMatchObject({ method: "Debugger.paused" });
		break;
	}

	// Resume execution (second worker-a debugger)
	await resumeWorker("worker-a");

	const res = await resPromise;
	expect(await res.text()).toBe("worker-a -> worker-b");
});

// The runtime inspector can send messages larger than 1MB limit websocket message permitted by UserWorkers.
// In the real-world, this is encountered when debugging large source files (source maps)
// or inspecting a variable that serializes to a large string.
// Connecting devtools directly to the inspector would work fine, but we proxy the inspector messages
// through the InspectorProxy, we need to make sure that such proxying does not hit the limit.
// By logging a large string we can verify that the inspector messages are being proxied successfully.
// (This issue was encountered with the wrangler inspector proxy worker: https://github.com/cloudflare/workers-sdk/issues/5297)
test("InspectorProxy: can proxy messages > 1MB", async ({ expect }) => {
	const LARGE_STRING = "This is a large string => " + "z".repeat(2 ** 20);

	const mf = new Miniflare({
		inspectorPort: 0,
		// Avoid the default handling of stdio since that will console log the very
		// large string in the test output. A no-op structured log handler consumes
		// the runtime output without forwarding it to the console.
		handleStructuredLogs() {},
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export default {
							fetch(request, env, ctx) {
								console.log("${LARGE_STRING}");
								return new Response(\`body:${LARGE_STRING}\`);
							}
						}
					`),
				},
				dev: { unsafeInspectorProxy: true },
			},
		],
	});
	useDispose(mf);

	const host = await getInspectorHostReady(mf);

	// Connect inspector WebSocket
	const ws = new WebSocket(`ws://${host}`);
	const messages = events.on(ws, "message");
	async function nextMessage() {
		const messageEvent = (await messages.next()).value;
		return JSON.parse(messageEvent[0].toString());
	}

	await events.once(ws, "open");

	ws.send(JSON.stringify({ id: 0, method: "Runtime.enable" }));

	expect(await nextMessage()).toMatchObject({
		method: "Runtime.executionContextCreated",
	});

	expect(await nextMessage()).toMatchObject({ id: 0 });

	ws.send(JSON.stringify({ id: 1, method: "Debugger.enable" }));

	expect(await nextMessagesUntilResponse(nextMessage, 1)).toContainEqual(
		userScriptParsedEvent(expect)
	);

	// Send request had check that the large string gets logged
	const resPromise = mf.dispatchFetch("http://localhost");

	const msg: {
		method: string;
		params: {
			type: string;
			args: { type: string; value: unknown }[];
		};
	} = await nextMessage();

	expect(msg.method).toBe("Runtime.consoleAPICalled");
	expect(msg.params.type).toBe("log");
	expect(msg.params.args.length).toBe(1);
	expect(msg.params.args[0].type).toBe("string");
	expect(msg.params.args[0].value).toBe(LARGE_STRING);

	const res = await resPromise;
	expect(await res.text()).toBe(`body:${LARGE_STRING}`);
});

/**
 * Returns the `host:port` the inspector proxy listens on.
 *
 * Tests connect to this address rather than to `localhost`. The proxy listens
 * on 127.0.0.1 only, and Node tries `localhost`'s IPv6 address, ::1, first. If
 * another server listens on the same port number on ::1, as concurrently
 * running tests' servers can, requests to `localhost` reach that server.
 */
async function getInspectorHostReady(mf: Miniflare): Promise<string> {
	await mf.ready;

	// when the inspector proxy is created there are some ws message exchanges between it
	// and the runtime, these can interfere with testing and make tests flaky, so we just
	// wait a bit here to avoid such problems
	await setTimeout(150);

	const { host } = await mf.getInspectorURL();
	return host;
}

/**
 * Sets `mf`'s `inspectorPort`, which must start as 0, to the port the
 * inspector proxy was given, and returns the proxy's `host:port`.
 *
 * Tests use this to start from a fixed port. Choosing a free port up front and
 * passing it to Miniflare would let another process take it before Miniflare
 * listens on it.
 */
async function useFixedInspectorPort(
	mf: Miniflare,
	options: MiniflareOptions
): Promise<string> {
	const host = await getInspectorHostReady(mf);
	const { port } = new URL(`http://${host}`);
	await mf.setOptions({ ...options, inspectorPort: parseInt(port) });
	const fixedHost = await getInspectorHostReady(mf);
	if (fixedHost !== host) {
		throw new Error(`Inspector moved from ${host} to ${fixedHost}`);
	}
	return host;
}

function listenOnRandomPort(server: net.Server): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve((server.address() as net.AddressInfo).port);
		});
	});
}

function closeServer(server: net.Server): Promise<void> {
	return new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve()))
	);
}

type InspectorMessage = { id?: number; method?: string; params?: unknown };

/**
 * Reads inspector messages until the response to the command with the given
 * `id` arrives. Before responding, the runtime may emit any number of events,
 * such as a `Debugger.scriptParsed` event for each script it loaded before the
 * user's code. The number of those scripts varies between workerd versions, so
 * tests should not depend on it.
 *
 * @param nextMessage Returns the next message received from the inspector
 * @param id The `id` of the command whose response should be awaited
 * @returns The messages received before the response
 */
async function nextMessagesUntilResponse(
	nextMessage: () => Promise<InspectorMessage>,
	id: number
): Promise<InspectorMessage[]> {
	const preceding: InspectorMessage[] = [];
	while (true) {
		const message = await nextMessage();
		if (message.id === id) {
			return preceding;
		}
		preceding.push(message);
	}
}

/**
 * Matches the `Debugger.scriptParsed` event for a test worker's `index.mjs`
 * main module, ignoring events for scripts internal to the runtime.
 *
 * @param expect The `expect` from the test context
 * @returns An asymmetric matcher for the event
 */
function userScriptParsedEvent(expect: ExpectStatic) {
	return expect.objectContaining({
		method: "Debugger.scriptParsed",
		params: expect.objectContaining({
			url: expect.stringMatching(/\/index\.mjs$/),
		}),
	});
}
