import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "./test-shared";

// https://github.com/cloudflare/workers-sdk/issues/7356
test("passThroughOnException with no upstream does not loop or hang", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2024-11-26",
					manifest: singleModuleManifest(`
						export default {
							fetch(request, env, ctx) {
								ctx.passThroughOnException();
								throw new Error("bang");
							}
						}`),
				},
			},
		],
	});
	useDispose(mf);
	const url = await mf.ready;
	const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
	// Must respond with an error response, like curl against `wrangler dev` would expect
	expect(res.status).toBeGreaterThanOrEqual(500);
	await res.arrayBuffer();
}, 20_000);
