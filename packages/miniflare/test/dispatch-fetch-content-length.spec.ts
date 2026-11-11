import { gzipSync } from "node:zlib";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "./test-shared";

// https://github.com/cloudflare/workers-sdk/issues/10375
test("dispatchFetch does not return the encoded Content-Length for a decoded body", async ({
	expect,
}) => {
	const body = "hello world ".repeat(1000);
	const gzipped = gzipSync(body);
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-05-01",
					env: { GZIPPED: { type: "text", value: gzipped.toString("base64") } },
					manifest: singleModuleManifest(`
						export default {
							fetch(request, env) {
								const bytes = Uint8Array.from(atob(env.GZIPPED), (c) => c.charCodeAt(0));
								return new Response(bytes, {
									headers: { "Content-Encoding": "gzip", "Content-Type": "text/plain" },
									encodeBody: "manual",
								});
							},
						};`),
				},
			},
		],
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost/", {
		headers: { "Accept-Encoding": "gzip" },
	});
	const bytes = new Uint8Array(await res.arrayBuffer());
	expect(res.headers.get("Content-Encoding")).toBe(null);
	expect(bytes.byteLength).toBe(body.length);
	// Content-Length, if present, must describe the decoded body
	const contentLength = res.headers.get("Content-Length");
	if (contentLength !== null) {
		expect(Number(contentLength)).toBe(bytes.byteLength);
	}
});
