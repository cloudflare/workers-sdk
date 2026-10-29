import { newWebSocketRpcSession } from "capnweb";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import remoteBindingsWorkerSource from "worker:remoteBindings/ProxyServerWorker";

test("forwards Analytics Engine writes through the retained remote proxy", async ({
	expect,
	onTestFinished,
}) => {
	const miniflare = new Miniflare({
		workers: [
			{
				config: {
					name: "analytics-engine-proxy",
					compatibilityDate: "2026-10-23",
					manifest: {
						mainModule: "index.mjs",
						modules: {
							"proxy.mjs": {
								type: "esm",
								contents: remoteBindingsWorkerSource,
							},
							"index.mjs": {
								type: "esm",
								contents: `
import proxy from "./proxy.mjs";
const writes = [];
// Like the native binding, this has a custom prototype that capnweb cannot expose directly.
class AnalyticsEngine {
  writeDataPoint(event) { writes.push(event); }
}
const dataset = new AnalyticsEngine();
export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/writes") {
      return Response.json(writes);
    }
    return proxy.fetch(request, { EVENTS: dataset }, ctx);
  }
};`,
							},
						},
					},
					env: {},
				},
			},
		],
	});
	onTestFinished(() => miniflare.dispose());
	const url = await miniflare.ready;
	const remote = newWebSocketRpcSession<{
		writeDataPoint(event?: { blobs: string[]; indexes: string[] }): void;
	}>(`ws://${url.host}/?MF-Binding=EVENTS`);
	try {
		const event = { blobs: ["vite-v1"], indexes: ["retained-proxy"] };
		await remote.writeDataPoint(event);
		const response = await miniflare.dispatchFetch(new URL("/writes", url));
		expect(await response.json()).toEqual([event]);
	} finally {
		remote[Symbol.dispose]();
	}
});
