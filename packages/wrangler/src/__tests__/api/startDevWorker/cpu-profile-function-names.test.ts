import events from "node:events";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { assert, describe, test, vi } from "vitest";
import WebSocket from "ws";
import { startWorker } from "../../../api/startDevWorker";
import { mockConsoleMethods } from "../../helpers/mock-console";

vi.unmock("child_process");
vi.unmock("undici");

type ProfileNode = {
	id: number;
	callFrame: {
		functionName: string;
		url: string;
		lineNumber: number;
		columnNumber: number;
	};
	hitCount?: number;
};

/**
 * Minimal Chrome DevTools Protocol client, sending commands the way the
 * DevTools "Performance" panel does when recording a CPU profile.
 */
function createDevToolsClient(ws: WebSocket) {
	let nextId = 1;
	const pending = new Map<number, (message: unknown) => void>();
	ws.on("message", (data) => {
		const message = JSON.parse(data.toString()) as { id?: number };
		if (message.id !== undefined) {
			pending.get(message.id)?.(message);
			pending.delete(message.id);
		}
	});
	return {
		send<T = unknown>(method: string, params: object = {}): Promise<T> {
			const id = nextId++;
			ws.send(JSON.stringify({ id, method, params }));
			return new Promise<T>((resolve) =>
				pending.set(id, resolve as (message: unknown) => void)
			);
		},
	};
}

// https://github.com/cloudflare/workers-sdk/issues/7813
describe("CPU profiles recorded with DevTools during local dev", () => {
	runInTempDir();
	mockConsoleMethods();

	test("name the Worker's functions rather than showing them as (anonymous)", async ({
		expect,
	}) => {
		// The example from
		// https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/#an-example-profile
		// whose profile shows `addNumbers` and `moreAddition`
		await seed({
			"index.js": `const addNumbers = (body) => {
  for (let i = 0; i < 5000; ++i) {
    body = body + " " + i;
  }
  return body;
};

const moreAddition = (body) => {
  for (let i = 5001; i < 15000; ++i) {
    body = body + " " + i;
  }
  return body;
};

export default {
  async fetch(request, env, ctx) {
    let body = "Hello Profiler! - ";
    body = addNumbers(body);
    body = moreAddition(body);
    return new Response(body);
  },
};
`,
		});

		const worker = await startWorker({
			entrypoint: "index.js",
			compatibilityDate: "2025-01-01",
			dev: {
				server: { hostname: "127.0.0.1", port: 0 },
				inspector: { port: 0 },
				persist: false,
			},
		});
		try {
			await worker.ready;
			const inspectorUrl = await worker.inspectorUrl;
			assert(inspectorUrl, "missing inspectorUrl");

			const ws = new WebSocket(inspectorUrl.href, {
				origin: "https://devtools.devprod.cloudflare.dev",
			});
			await events.once(ws, "open");
			try {
				const devtools = createDevToolsClient(ws);
				await devtools.send("Runtime.enable");
				await devtools.send("Debugger.enable");
				await devtools.send("Profiler.enable");
				await devtools.send("Profiler.setSamplingInterval", { interval: 50 });
				await devtools.send("Profiler.start");

				const response = await worker.fetch("http://dummy/");
				expect(await response.text()).toContain("Hello Profiler! - ");

				const stopped = await devtools.send<{
					result: { profile: { nodes: ProfileNode[] } };
				}>("Profiler.stop");

				// The frames sampled in the Worker's bundled script, named as
				// DevTools names them
				const userFrames = stopped.result.profile.nodes
					.filter((node) => node.callFrame.url.endsWith("index.js"))
					.map((node) => node.callFrame.functionName || "(anonymous)");

				expect(userFrames).toEqual(
					expect.arrayContaining(["addNumbers", "moreAddition"])
				);
			} finally {
				ws.close();
			}
		} finally {
			await worker.dispose();
		}
	});
});
