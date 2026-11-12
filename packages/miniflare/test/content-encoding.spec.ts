import zlib from "node:zlib";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose, useServer } from "./test-shared";

// https://github.com/cloudflare/workers-sdk/issues/9522
//
// `Miniflare#dispatchFetch()` assumes `undici.fetch()` has decoded the response
// body, and so always moves `Content-Encoding` to `MF-Content-Encoding`. But
// `undici` only decodes the codings it knows (`gzip`, `deflate`, `br`, and
// `zstd` only where `node:zlib` has it, which is Node 22.15+, whereas Miniflare
// supports Node 22.12+). Any other coding reaches the caller still encoded, but
// without a `Content-Encoding` header, so clients read the encoded bytes as if
// they were the content.
//
// `compress` is a registered coding `undici` never decodes. On Node without
// zstd in `node:zlib`, `zstd` is checked too, as in the original report.
const undecodableCodings = ["compress"];
if (typeof zlib.createZstdDecompress !== "function") {
	undecodableCodings.push("zstd");
}

test.for(undecodableCodings)(
	"Miniflare: dispatchFetch() keeps Content-Encoding %s of a subrequest response it can't decode",
	async (coding, { expect }) => {
		// Stands in for an origin's encoded bytes: nothing between the origin and
		// the caller can decode them, so they must arrive unchanged
		const encodedBody = new Uint8Array([
			0x28, 0xb5, 0x2f, 0xfd, 0x20, 0x05, 0x29, 0x00, 0x00, 0x68, 0x65, 0x6c,
			0x6c, 0x6f,
		]);
		const { http } = await useServer((req, res) => {
			res.writeHead(200, {
				"Content-Encoding": coding,
				"Content-Type": "text/plain",
				"Content-Length": encodedBody.byteLength,
			});
			res.end(encodedBody);
		});

		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-05-01",
						env: { UPSTREAM: { type: "text", value: http.href } },
						manifest: singleModuleManifest(`
						export default {
							async fetch(request, env) {
								// Proxy the origin's response through, as is
								return fetch(env.UPSTREAM, {
									headers: { "Accept-Encoding": "${coding}" },
								});
							}
						}
					`),
					},
				},
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost", {
			headers: { "Accept-Encoding": coding },
		});
		const body = new Uint8Array(await res.arrayBuffer());

		// The body is still encoded...
		expect(body).toEqual(encodedBody);
		// ...so the response must still say how
		expect(res.headers.get("Content-Encoding")).toBe(coding);
	}
);
