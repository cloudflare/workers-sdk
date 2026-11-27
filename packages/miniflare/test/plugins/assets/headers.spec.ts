import fs from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

const WORKER_SCRIPT = `export default {
	async fetch(request, env) {
		return new Response("from user worker");
	}
}`;

function makeOptions(directory: string): MiniflareOptions {
	return {
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-01-01",
					manifest: singleModuleManifest(WORKER_SCRIPT),
					assets: { directory },
				},
			},
		],
	};
}

async function fetchWithHeadersFile(headersFile: string) {
	const tmp = await useTmp();
	await fs.writeFile(path.join(tmp, "index.html"), "hi");
	await fs.writeFile(path.join(tmp, "_headers"), headersFile);

	const mf = new Miniflare(makeOptions(tmp));
	useDispose(mf);

	const res = await mf.dispatchFetch("http://example.com/");
	await res.arrayBuffer();
	return res;
}

test("_headers applies the headers of every rule matching a request", async ({
	expect,
}) => {
	const res = await fetchWithHeadersFile(
		[
			"/*",
			"  X-Frame-Options: DENY",
			"  X-Content-Type-Options: nosniff",
			"",
			"/",
			"  Cache-Control: public, max-age=3600",
			"",
		].join("\n")
	);

	expect(res.status).toBe(200);
	expect(res.headers.get("x-frame-options")).toBe("DENY");
	expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
});

// https://github.com/cloudflare/workers-sdk/issues/17139
test("_headers applies the headers of every block when the same path appears twice", async ({
	expect,
}) => {
	const res = await fetchWithHeadersFile(
		[
			"/*",
			"  X-Frame-Options: DENY",
			"  X-Content-Type-Options: nosniff",
			"",
			"/*",
			"  Cache-Control: public, max-age=3600",
			"",
		].join("\n")
	);

	expect(res.status).toBe(200);
	expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
	expect(res.headers.get("x-frame-options")).toBe("DENY");
	expect(res.headers.get("x-content-type-options")).toBe("nosniff");
});
