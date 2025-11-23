import events from "node:events";
import { setTimeout } from "node:timers/promises";
import test from "ava";
import getPort from "get-port";
import {
	fetch,
	Miniflare,
	MiniflareCoreError,
	MiniflareOptions,
} from "miniflare";
import WebSocket from "ws";
import { waitUntil } from "../../../test-shared";

const nullScript =
	'addEventListener("fetch", (event) => event.respondWith(new Response(null, { status: 404 })));';

test.before(() => {
	// the tests in this file don't immediately consume bodies of fetch requests (since they
	// test the debugging/inspector behavior), so we need to skip the bodies check by
	// setting process.env.MINIFLARE_ASSERT_BODIES_CONSUMED to undefined
	process.env.MINIFLARE_ASSERT_BODIES_CONSUMED = undefined;
});

test("InspectorProxy: /json/version should provide details about the inspector version", async (t) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				script: nullScript,
				unsafeInspectorProxy: true,
			},
		],
	});
	t.teardown(() => mf.dispose());

	const port = await getInspectorPortReady(mf);

	const res = await fetch(`http://localhost:${port}/json/version`);
	t.is(res.headers.get("content-type"), "application/json");

	const versionDetails = (await res.json()) as Record<string, string>;

	t.regex(versionDetails["Browser"], /^miniflare\/v\d\.\d{8}\.\d+$/);
	t.regex(versionDetails["Protocol-Version"], /^\d+\.\d+$/);
});

test("InspectorProxy: /json should provide a list of a single worker inspector", async (t) => {
	const mf = new Miniflare({
		inspectorPort: 0,
		workers: [
			{
				script: nullScript,
				unsafeInspectorProxy: true,
			},
		],
	});
	t.teardown(() => mf.dispose());

	const port = await getInspectorPortReady(mf);

	const res = await fetch(`http://localhost:${port}/json`);
	const inspectors = (await res.json()) as Record<string, string>[];

	t.is(res.headers.get("content-type"), "application/json");

	t.is(inspectors.length, 1);

	t.is(inspectors[0]["description"], "workers");
	t.is(inspectors[0]["title"], "Cloudflare Worker");
	t.is(inspectors[0]["webSocketDebuggerUrl"], `ws://localhost:${port}/`);
});

test("InspectorProxy: proxy port validation", async (t) => {
	t.throws(
		() =>
			new Miniflare({
				workers: [
					{
						script: nullScript,
						unsafeInspectorProxy: true,
					},
				],
			}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_MISSING_INSPECTOR_PROXY_PORT",
			message:
				"inspector proxy requested but without an inspectorPort specified",
		}
	);
});

test("InspectorProxy: /json should provide a list of a multiple worker inspector", async (t) => {
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
	t.teardown(() => mf.dispose());

	const port = await getInspectorPortReady(mf);

	const res = await fetch(`http://localhost:${port}/json`);
	t.is(res.headers.get("content-type"), "application/json");

	const inspectors = (await res.json()) as Record<string, string>[];

	t.is(inspectors.length, 3);

	t.is(inspectors[0]["description"], "workers");
	t.is(inspectors[0]["title"], "Cloudflare Worker");
	t.is(inspectors[0]["webSocketDebuggerUrl"], `ws://localhost:${port}/`);
	t.is(inspectors[1]["description"], "workers");
	t.is(inspectors[1]["title"], "Cloudflare Worker: extra-worker-a");
	t.is(
		inspectors[1]["webSocketDebuggerUrl"],
		`ws://localhost:${port}/extra-worker-a`
	);
	t.is(inspectors[2]["description"], "workers");
	t.is(inspectors[2]["title"], "Cloudflare Worker: extra-worker-b");
	t.is(
		inspectors[2]["webSocketDebuggerUrl"],
		`ws://localhost:${port}/extra-worker-b`
	);
});

test("InspectorProxy: /json should provide a list of a multiple worker inspector with some filtered out", async (t) => {
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
	t.teardown(() => mf.dispose());

	const port = await getInspectorPortReady(mf);

	const res = await fetch(`http://localhost:${port}/json`);
	t.is(res.headers.get("content-type"), "application/json");

	const inspectors = (await res.json()) as Record<string, string>[];

	t.is(inspectors.length, 2);

	t.is(inspectors[0]["description"], "workers");
	t.is(inspectors[0]["title"], "Cloudflare Worker");
	t.is(inspectors[0]["webSocketDebuggerUrl"], `ws://localhost:${port}/`);
	t.is(inspectors[1]["description"], "workers");
	t.is(inspectors[1]["title"], "Cloudflare Worker: extra-worker-b");
	t.is(
		inspectors[1]["webSocketDebuggerUrl"],
		`ws://localhost:${port}/extra-worker-b`
	);
});

test("InspectorProxy: should allow inspector port updating via miniflare#setOptions", async (t) => {
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
	t.teardown(() => mf.dispose());

	t.is(await getInspectorPortReady(mf), initialInspectorPort);

	let res = await fetch(
		`http://localhost:${initialInspectorPort}/json/version`
	);
	t.is(res.status, 200);

	const newInspectorPort = await getPort();
	await mf.setOptions({ ...options, inspectorPort: newInspectorPort });

	t.not(initialInspectorPort, newInspectorPort);

	t.is(await getInspectorPortReady(mf), newInspectorPort);

	res = await fetch(`http://localhost:${newInspectorPort}/json/version`);
	t.is(res.status, 200);

	await waitUntil(t, async (t) => {
		try {
			await fetch(`http://localhost:${initialInspectorPort}/json/version`);
		} catch {
			t.pass("Old inspector port no longer responding");
			return;
		}
		t.fail("Old inspector port still responding");
	});
});

test("InspectorProxy: should keep the same inspector port on miniflare#setOptions calls with inspectorPort set to 0", async (t) => {
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
	t.teardown(() => mf.dispose());

	const oldPort = await getInspectorPortReady(mf);

	await mf.setOptions({ ...options, cf: false });

	const newPort = await getInspectorPortReady(mf);

	t.is(oldPort, newPort);
});

test("InspectorProxy: should not keep the same inspector port on miniflare#setOptions calls changing inspectorPort to 0", async (t) => {
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
	t.teardown(() => mf.dispose());

	t.is(await getInspectorPortReady(mf), initialInspectorPort);

	await mf.setOptions({ ...options, inspectorPort: 0 });
	const newInspectorPort = await getInspectorPortReady(mf);

	t.not(initialInspectorPort, newInspectorPort);

	const res = await fetch(`http://localhost:${newInspectorPort}/json/version`);
	t.is(res.status, 200);

	await t.throwsAsync(
		fetch(`http://localhost:${initialInspectorPort}/json/version`)
	);
});

test("InspectorProxy: should allow debugging a single worker", async (t) => {
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
	t.teardown(() => mf.dispose());

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

	t.like(await nextMessage(), {
		method: "Debugger.scriptParsed",
	});

	t.like(await nextMessage(), { id: 0 });

	// Send request and hit `debugger;` statement
	const resPromise = mf.dispatchFetch("http://localhost");
	t.like(await nextMessage(), { method: "Debugger.paused" });

	// Resume execution
	ws.send(JSON.stringify({ id: 1, method: "Debugger.resume" }));

	t.like(await nextMessage(), { id: 1 });

	t.like(await nextMessage(), { method: "Debugger.resumed" });

	const res = await resPromise;
	t.is(await res.text(), "body");
});

test("InspectorProxy: the devtools websocket communication should adapt to an inspector port changes in a miniflare#setOptions calls", async (t) => {
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
	t.teardown(() => mf.dispose());

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

		t.like(await nextMessage(), {
			method: "Debugger.scriptParsed",
		});

		t.like(await nextMessage(), { id: 0 });

		// Send request and hit `debugger;` statement
		const resPromise = mf.dispatchFetch("http://localhost");
		t.like(await nextMessage(), { method: "Debugger.paused" });

		// Resume execution
		ws.send(JSON.stringify({ id: 1, method: "Debugger.resume" }));

		t.like(await nextMessage(), { id: 1 });

		t.like(await nextMessage(), { method: "Debugger.resumed" });

		const res = await resPromise;
		t.is(await res.text(), "body");

		ws.close();
	};

	const initialInspectorPort = await getInspectorPortReady(mf);

	await testDebuggingWorkerOn(initialInspectorPort);

	mf.setOptions({ ...options, inspectorPort: await getPort() });

	const newInspectorPort = await getInspectorPortReady(mf);

	t.not(initialInspectorPort, newInspectorPort);

	await testDebuggingWorkerOn(newInspectorPort);
});

test("InspectorProxy: should allow debugging multiple workers", async (t) => {
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
	t.teardown(() => mf.dispose());

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
		t.like(await nextMessage(worker), {
			method: "Debugger.scriptParsed",
		});

		t.like(await nextMessage(worker), { id: 0 });
	};

	await waitForScriptParsed("worker-a");
	await waitForScriptParsed("worker-b");

	// Send request and hit `debugger;` statements
	const resPromise = mf.dispatchFetch("http://localhost");
	t.like(await nextMessage("worker-a"), { method: "Debugger.paused" });

	const resumeWorker = async (worker: Worker) => {
		const id = Math.floor(Math.random() * 50_000);
		webSockets[worker].send(JSON.stringify({ id, method: "Debugger.resume" }));
		t.like(await nextMessage(worker), { id });
		t.like(await nextMessage(worker), { method: "Debugger.resumed" });
	};

	// Resume execution (first worker-a debugger)
	await resumeWorker("worker-a");

	t.like(await nextMessage("worker-b"), { method: "Debugger.paused" });

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

		t.like(nextMessageWorkerA, { method: "Debugger.paused" });
		break;
	}

	// Resume execution (second worker-a debugger)
	await resumeWorker("worker-a");

	const res = await resPromise;
	t.is(await res.text(), "worker-a -> worker-b");
});

test("InspectorProxy: should allow debugging workers created via setOptions", async (t) => {
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
	t.teardown(() => mf.dispose());

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
		t.like(await nextMessage(worker), {
			method: "Debugger.scriptParsed",
		});

		t.like(await nextMessage(worker), { id: 0 });
	};

	await waitForScriptParsed("worker-a");
	await waitForScriptParsed("worker-b");

	// Send request and hit `debugger;` statements
	const resPromise = mf.dispatchFetch("http://localhost");
	t.like(await nextMessage("worker-a"), { method: "Debugger.paused" });

	const resumeWorker = async (worker: Worker) => {
		const id = Math.floor(Math.random() * 50_000);
		webSockets[worker].send(JSON.stringify({ id, method: "Debugger.resume" }));
		t.like(await nextMessage(worker), { id });
		t.like(await nextMessage(worker), { method: "Debugger.resumed" });
	};

	// Resume execution (first worker-a debugger)
	await resumeWorker("worker-a");

	t.like(await nextMessage("worker-b"), { method: "Debugger.paused" });

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

		t.like(nextMessageWorkerA, { method: "Debugger.paused" });
		break;
	}

	// Resume execution (second worker-a debugger)
	await resumeWorker("worker-a");

	const res = await resPromise;
	t.is(await res.text(), "worker-a -> worker-b");
});

// The runtime inspector can send messages larger than 1MB limit websocket message permitted by UserWorkers.
// In the real-world, this is encountered when debugging large source files (source maps)
// or inspecting a variable that serializes to a large string.
// Connecting devtools directly to the inspector would work fine, but we proxy the inspector messages
// through the InspectorProxy, we need to make sure that such proxying does not hit the limit.
// By logging a large string we can verify that the inspector messages are being proxied successfully.
// (This issue was encountered with the wrangler inspector proxy worker: https://github.com/cloudflare/workers-sdk/issues/5297)
test("InspectorProxy: can proxy messages > 1MB", async (t) => {
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
	t.teardown(() => mf.dispose());

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

	t.like(await nextMessage(), {
		method: "Runtime.executionContextCreated",
	});

	t.like(await nextMessage(), { id: 0 });

	ws.send(JSON.stringify({ id: 1, method: "Debugger.enable" }));

	t.like(await nextMessage(), {
		method: "Debugger.scriptParsed",
	});

	t.like(await nextMessage(), { id: 1 });

	// Send request had check that the large string gets logged
	const resPromise = mf.dispatchFetch("http://localhost");

	const msg: {
		method: string;
		params: {
			type: string;
			args: { type: string; value: unknown }[];
		};
	} = await nextMessage();

	t.is(msg.method, "Runtime.consoleAPICalled");
	t.is(msg.params.type, "log");
	t.is(msg.params.args.length, 1);
	t.is(msg.params.args[0].type, "string");
	t.is(msg.params.args[0].value, LARGE_STRING);

	const res = await resPromise;
	t.is(await res.text(), `body:${LARGE_STRING}`);
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
