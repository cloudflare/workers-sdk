import http from "node:http";
import zlib from "node:zlib";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "./test-shared";

// https://github.com/cloudflare/workers-sdk/issues/6577
test("streams text/html responses when the client accepts gzip", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
						export default {
							async fetch() {
								const { readable, writable } = new TransformStream();
								const writer = writable.getWriter();
								const encoder = new TextEncoder();
								(async () => {
									await writer.write(encoder.encode("<p>first</p>"));
									await new Promise((r) => setTimeout(r, 1500));
									await writer.write(encoder.encode("<p>second</p>"));
									await writer.close();
								})();
								return new Response(readable, {
									headers: { "content-type": "text/html" },
								});
							},
						};
					`),
				},
			},
		],
	});
	useDispose(mf);
	const url = await mf.ready;

	const firstChunkDelay = await new Promise<number>((resolve, reject) => {
		const start = Date.now();
		const req = http.get(
			url,
			{ headers: { "accept-encoding": "gzip, deflate, br, zstd" } },
			(res) => {
				const gunzip = zlib.createGunzip();
				res.pipe(gunzip);
				gunzip.once("data", () => {
					resolve(Date.now() - start);
					res.destroy();
				});
				gunzip.on("error", () => {});
				res.on("error", () => {});
			}
		);
		req.on("error", reject);
	});

	// The first chunk should arrive well before the worker writes the second
	expect(firstChunkDelay).toBeLessThan(1000);
});
