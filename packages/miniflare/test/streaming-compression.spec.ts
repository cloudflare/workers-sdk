import http from "node:http";
import zlib from "node:zlib";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "./test-shared";

// https://github.com/cloudflare/workers-sdk/issues/8004
test("Miniflare: does not buffer streamed responses when client sends Accept-Encoding", async ({
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
		const encoder = new TextEncoder();
		const { readable, writable } = new TransformStream();
		const writer = writable.getWriter();
		(async () => {
			await writer.write(encoder.encode("<html><body>first chunk</body>"));
			await new Promise((resolve) => setTimeout(resolve, 3000));
			await writer.write(encoder.encode("second chunk</html>"));
			await writer.close();
		})();
		return new Response(readable, { headers: { "Content-Type": "text/html" } });
	}
}`),
				},
			},
		],
	});
	useDispose(mf);
	const url = await mf.ready;

	const start = Date.now();
	const firstChunkAt = await new Promise<number>((resolve, reject) => {
		const req = http.get(
			url,
			{ headers: { "Accept-Encoding": "gzip, deflate, br, zstd" } },
			(res) => {
				const gunzip = zlib.createGunzip(); res.pipe(gunzip); gunzip.once("data", () => resolve(Date.now() - start)); gunzip.on("error", reject);
				res.on("error", reject);
			}
		);
		req.on("error", reject);
	});
	// The first chunk should arrive well before the worker writes the second
	expect(firstChunkAt).toBeLessThan(2000);
});
