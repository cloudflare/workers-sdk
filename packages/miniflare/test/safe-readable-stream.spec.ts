import { Miniflare, Response as MiniflareResponse } from "miniflare";

import { test } from "vitest";
import { singleModuleManifest, useDispose } from "./test-shared";

// https://github.com/cloudflare/workers-sdk/issues/16300
test("cancelling a request body does not throw an uncaught 'Controller is already closed'", async ({
	expect,
}) => {
	const uncaught: unknown[] = [];
	const onUncaught = (e: unknown) => uncaught.push(e);
	process.on("uncaughtException", onUncaught);
	try {
		const cancelled = Promise.withResolvers<void>();
		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest(`export default {
							fetch(request, env) {
								// Send a body that is aborted after the handler has cancelled it
								const body = new ReadableStream({
									start(controller) {
										controller.enqueue(new TextEncoder().encode("first"));
										setTimeout(() => controller.error(new Error("aborted")), 400);
									},
								});
								return env.CUSTOM.fetch("http://placeholder/", {
									method: "POST",
									body,
									duplex: "half",
								});
							}
						}`),
						env: {
							CUSTOM: {
								type: "fetcher",
								handler: async (request: Request) => {
									const reader = request.body!.getReader();
									await reader.read();
									await new Promise((r) => setTimeout(r, 100));
									// Cancel the body while the loopback `pull()` is waiting on
									// the next chunk of the incoming request
									void reader.cancel();
									cancelled.resolve();
									return new MiniflareResponse("done");
								},
							},
						},
					},
				},
			],
		});
		useDispose(mf);
		await mf.ready;

		void mf
			.dispatchFetch("http://localhost/")
			.then((res) => res.text())
			.catch(() => {});
		await cancelled.promise;
		await new Promise((resolve) => setTimeout(resolve, 1000));
		expect(
			uncaught.filter((e) => String(e).includes("Controller is already closed"))
		).toEqual([]);
	} finally {
		process.off("uncaughtException", onUncaught);
	}
});
