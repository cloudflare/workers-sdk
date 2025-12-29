import events from "node:events";
import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import {
	fetch,
	Miniflare,
	MiniflareCoreError,
	MiniflareOptions,
} from "miniflare";
import { beforeAll, expect, test, vi } from "vitest";
import WebSocket from "ws";
import { useDispose } from "../../../test-shared";

const nullScript =
	'addEventListener("fetch", (event) => event.respondWith(new Response(null, { status: 404 })));';

beforeAll(() => {
	// the tests in this file don't immediately consume bodies of fetch requests (since they
	// test the debugging/inspector behavior), so we need to skip the bodies check by
	// setting process.env.MINIFLARE_ASSERT_BODIES_CONSUMED to undefined
	process.env.MINIFLARE_ASSERT_BODIES_CONSUMED = undefined;
});

test("InspectorProxy: /json/version should provide details about the inspector version", async () => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				script: nullScript,
				unsafeInspectorProxy: true,
			},
		],
	});
	useDispose(mf);

	const port = await getInspectorPortReady(mf);

	const res = await fetch(`http://localhost:${port}/json/version`);
	expect(res.headers.get("content-type")).toBe("application/json");

	const versionDetails = (await res.json()) as Record<string, string>;

	expect(versionDetails["Browser"]).toMatch(/^miniflare\/v\d\.\d{8}\.\d+$/);
	expect(versionDetails["Protocol-Version"]).toMatch(/^\d+\.\d+$/);
});

test("InspectorProxy: /json should provide a list of a single worker inspector", async () => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				script: nullScript,
				unsafeInspectorProxy: true,
			},
		],
	});
	useDispose(mf);

	const port = await getInspectorPortReady(mf);

	const res = await fetch(`http://localhost:${port}/json`);
	const inspectors = (await res.json()) as Record<string, string>[];

	expect(res.headers.get("content-type")).toBe("application/json");

	expect(inspectors.length).toBe(1);

	expect(inspectors[0]["description"]).toBe("workers");
	expect(inspectors[0]["title"]).toBe("Cloudflare Worker");
	expect(inspectors[0]["webSocketDebuggerUrl"]).toBe(`ws://localhost:${port}/`);
});

test("InspectorProxy: proxy port validation", async () => {
	expect(
		() =>
			new Miniflare({
				workers: [
					{
						script: nullScript,
						unsafeInspectorProxy: true,
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

test("InspectorProxy: /json should provide a list of a multiple worker inspector", async () => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				script: nullScript,
				unsafeInspectorProxy: true,
			},
			{
				name: "extra-worker-a",
				script: nullScript,
				unsafeInspectorProxy: true,
			},
			{
				name: "extra-worker-b",
				script: nullScript,
				unsafeInspectorProxy: true,
			},
		],
	});
	useDispose(mf);

	const port = await getInspectorPortReady(mf);

	const res = await fetch(`http://localhost:${port}/json`);
	expect(res.headers.get("content-type")).toBe("application/json");

	const inspectors = (await res.json()) as Record<string, string>[];

	expect(inspectors.length).toBe(3);

	expect(inspectors[0]["description"]).toBe("workers");
	expect(inspectors[0]["title"]).toBe("Cloudflare Worker");
	expect(inspectors[0]["webSocketDebuggerUrl"]).toBe(`ws://localhost:${port}/`);
	expect(inspectors[1]["description"]).toBe("workers");
	expect(inspectors[1]["title"]).toBe("Cloudflare Worker: extra-worker-a");
	expect(inspectors[1]["webSocketDebuggerUrl"]).toBe(
		`ws://localhost:${port}/extra-worker-a`
	);
	expect(inspectors[2]["description"]).toBe("workers");
	expect(inspectors[2]["title"]).toBe("Cloudflare Worker: extra-worker-b");
	expect(inspectors[2]["webSocketDebuggerUrl"]).toBe(
		`ws://localhost:${port}/extra-worker-b`
	);
});

test("InspectorProxy: /json should provide a list of a multiple worker inspector with some filtered out", async () => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				script: nullScript,
				unsafeInspectorProxy: true,
			},
			{
				name: "extra-worker-a",
				script: nullScript,
			},
			{
				name: "extra-worker-b",
				script: nullScript,
				unsafeInspectorProxy: true,
			},
		],
	});
	useDispose(mf);

	const port = await getInspectorPortReady(mf);

	const res = await fetch(`http://localhost:${port}/json`);
	expect(res.headers.get("content-type")).toBe("application/json");

	const inspectors = (await res.json()) as Record<string, string>[];

	expect(inspectors.length).toBe(2);

	expect(inspectors[0]["description"]).toBe("workers");
	expect(inspectors[0]["title"]).toBe("Cloudflare Worker");
	expect(inspectors[0]["webSocketDebuggerUrl"]).toBe(`ws://localhost:${port}/`);
	expect(inspectors[1]["description"]).toBe("workers");
	expect(inspectors[1]["title"]).toBe("Cloudflare Worker: extra-worker-b");
	expect(inspectors[1]["webSocketDebuggerUrl"]).toBe(
		`ws://localhost:${port}/extra-worker-b`
	);
});

test("InspectorProxy: should allow inspector port updating via miniflare#setOptions", async () => {
	const initialInspectorPort = await getPort();
	const options: MiniflareOptions = {
		workers: [
			{
				script: nullScript,
				unsafeInspectorProxy: true,
			},
		],
	};
	const mf = new Miniflare({ ...options, inspectorPort: initialInspectorPort });
	useDispose(mf);

	expect(await getInspectorPortReady(mf)).toBe(initialInspectorPort);

	let res = await fetch(
		`http://localhost:${initialInspectorPort}/json/version`
	);
	expect(res.status).toBe(200);

	const newInspectorPort = await getPort();
	await mf.setOptions({ ...options, inspectorPort: newInspectorPort });

	expect(initialInspectorPort).not.toBe(newInspectorPort);

	expect(await getInspectorPortReady(mf)).toBe(newInspectorPort);

	res = await fetch(`http://localhost:${newInspectorPort}/json/version`);
	expect(res.status).toBe(200);

	await vi.waitFor(
		async () => {
			try {
				await fetch(`http://localhost:${initialInspectorPort}/json/version`);
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

test("InspectorProxy: should keep the same inspector port on miniflare#setOptions calls with inspectorPort set to 0", async () => {
	const options: MiniflareOptions = {
		inspectorPort: 0,
		workers: [
			{
				script: nullScript,
				unsafeInspectorProxy: true,
			},
		],
	};
	const mf = new Miniflare(options);
	useDispose(mf);

	const oldPort = await getInspectorPortReady(mf);

	await mf.setOptions({ ...options, cf: false });

	const newPort = await getInspectorPortReady(mf);

	expect(oldPort).toBe(newPort);
});

test("InspectorProxy: should not keep the same inspector port on miniflare#setOptions calls changing inspectorPort to 0", async () => {
	const initialInspectorPort = await getPort();
	const options: MiniflareOptions = {
		inspectorPort: initialInspectorPort,
		workers: [
			{
				script: nullScript,
				unsafeInspectorProxy: true,
			},
		],
	};
	const mf = new Miniflare(options);
	useDispose(mf);

	expect(await getInspectorPortReady(mf)).toBe(initialInspectorPort);

	await mf.setOptions({ ...options, inspectorPort: 0 });
	const newInspectorPort = await getInspectorPortReady(mf);

	expect(initialInspectorPort).not.toBe(newInspectorPort);

	const res = await fetch(`http://localhost:${newInspectorPort}/json/version`);
	expect(res.status).toBe(200);

	await expect(
		fetch(`http://localhost:${initialInspectorPort}/json/version`)
	).rejects.toThrow();
});

test("InspectorProxy: should allow debugging a single worker", async () => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				script: `
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("body");
							}
						}
					`,
				modules: true,
				unsafeInspectorProxy: true,
			},
		],
	});
	useDispose(mf);

	const port = await getInspectorPortReady(mf);

	// Connect inspector WebSocket
	const ws = new WebSocket(`ws://localhost:${port}`);
	const messages = events.on(ws, "message");
	async function nextMessage() {
		const messageEvent = (await messages.next()).value;
		return JSON.parse(messageEvent[0].toString());
	}

	await events.once(ws, "open");

	ws.send(JSON.stringify({ id: 0, method: "Debugger.enable" }));

	expect(await nextMessage()).toMatchObject({
		method: "Debugger.scriptParsed",
	});

	expect(await nextMessage()).toMatchObject({ id: 0 });

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

test("InspectorProxy: the devtools websocket communication should adapt to an inspector port changes in a miniflare#setOptions calls", async () => {
	const options: MiniflareOptions = {
		workers: [
			{
				script: `
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("body");
							}
						}
					`,
				modules: true,
				unsafeInspectorProxy: true,
			},
		],
	};
	const mf = new Miniflare({ ...options, inspectorPort: await getPort() });
	useDispose(mf);

	const testDebuggingWorkerOn = async (port: number) => {
		// Connect inspector WebSocket
		const ws = new WebSocket(`ws://localhost:${port}`);
		const messages = events.on(ws, "message");
		async function nextMessage() {
			const messageEvent = (await messages.next()).value;
			return JSON.parse(messageEvent[0].toString());
		}

		await events.once(ws, "open");

		ws.send(JSON.stringify({ id: 0, method: "Debugger.enable" }));

		expect(await nextMessage()).toMatchObject({
			method: "Debugger.scriptParsed",
		});

		expect(await nextMessage()).toMatchObject({ id: 0 });

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

	const initialInspectorPort = await getInspectorPortReady(mf);

	await testDebuggingWorkerOn(initialInspectorPort);

	mf.setOptions({ ...options, inspectorPort: await getPort() });

	const newInspectorPort = await getInspectorPortReady(mf);

	expect(initialInspectorPort).not.toBe(newInspectorPort);

	await testDebuggingWorkerOn(newInspectorPort);
});

test("InspectorProxy: should allow debugging multiple workers", async () => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				name: "worker-a",
				script: `
						export default {
							async fetch(request, env, ctx) {
								debugger;
								const workerBText = await env['WORKER_B'].fetch(request).then(resp => resp.text());
								debugger;
								return new Response(\`worker-a -> \${workerBText}\`);
							}
						}
					`,
				modules: true,
				serviceBindings: {
					WORKER_B: "worker-b",
				},
				unsafeInspectorProxy: true,
			},
			{
				name: "worker-b",
				script: `
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("worker-b");
							}
						}
					`,
				modules: true,
				unsafeInspectorProxy: true,
			},
		],
	});
	useDispose(mf);

	const port = await getInspectorPortReady(mf);

	// Connect inspector WebSockets
	const webSockets = {
		["worker-a"]: new WebSocket(`ws://localhost:${port}/worker-a`),
		["worker-b"]: new WebSocket(`ws://localhost:${port}/worker-b`),
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
		expect(await nextMessage(worker)).toMatchObject({
			method: "Debugger.scriptParsed",
		});

		expect(await nextMessage(worker)).toMatchObject({ id: 0 });
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

test("InspectorProxy: should allow debugging workers created via setOptions", async () => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				name: "worker-b",
				script: `
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("worker-b");
							}
						}
					`,
				modules: true,
				unsafeInspectorProxy: true,
			},
		],
	});
	useDispose(mf);

	await mf.ready;

	mf.setOptions({
		inspectorPort: 0,
		workers: [
			{
				name: "worker-a",
				script: `
						export default {
							async fetch(request, env, ctx) {
								debugger;
								const workerBText = await env['WORKER_B'].fetch(request).then(resp => resp.text());
								debugger;
								return new Response(\`worker-a -> \${workerBText}\`);
							}
						}
					`,
				modules: true,
				serviceBindings: {
					WORKER_B: "worker-b",
				},
				unsafeInspectorProxy: true,
			},
			{
				name: "worker-b",
				script: `
						export default {
							fetch(request, env, ctx) {
								debugger;
								return new Response("worker-b");
							}
						}
					`,
				modules: true,
				unsafeInspectorProxy: true,
			},
		],
	});

	const port = await getInspectorPortReady(mf);

	// Connect inspector WebSockets
	const webSockets = {
		["worker-a"]: new WebSocket(`ws://localhost:${port}/worker-a`),
		["worker-b"]: new WebSocket(`ws://localhost:${port}/worker-b`),
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
		expect(await nextMessage(worker)).toMatchObject({
			method: "Debugger.scriptParsed",
		});

		expect(await nextMessage(worker)).toMatchObject({ id: 0 });
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
test("InspectorProxy: can proxy messages > 1MB", async () => {
	const LARGE_STRING = "This is a large string => " + "z".repeat(2 ** 20);

	const mf = new Miniflare({
		inspectorPort: 0,
		// Avoid the default handling of stdio since that will console log the very large string in the test output.
		handleRuntimeStdio(stdout, stderr) {
			// We need to add these handlers otherwise the streams will not be consumed and the process will hang.
			stdout.on("data", () => {});
			stderr.on("data", () => {});
		},
		workers: [
			{
				script: `
						export default {
							fetch(request, env, ctx) {
								console.log("${LARGE_STRING}");
								return new Response(\`body:${LARGE_STRING}\`);
							}
						}
					`,
				modules: true,
				unsafeInspectorProxy: true,
			},
		],
	});
	useDispose(mf);

	const port = await getInspectorPortReady(mf);

	// Connect inspector WebSocket
	const ws = new WebSocket(`ws://localhost:${port}`);
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

	expect(await nextMessage()).toMatchObject({
		method: "Debugger.scriptParsed",
	});

	expect(await nextMessage()).toMatchObject({ id: 1 });

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

async function getInspectorPortReady(mf: Miniflare) {
	await mf.ready;

	// when the inspector proxy is created there are some ws message exchanges between it
	// and the runtime, these can interfere with testing and make tests flaky, so we just
	// wait a bit here to avoid such problems
	await setTimeout(150);

	const { port } = await mf.getInspectorURL();
	return parseInt(port);
}
