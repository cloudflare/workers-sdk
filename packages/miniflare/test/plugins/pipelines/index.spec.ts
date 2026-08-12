import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

test("supports declaring pipelines", async () => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2024-12-30",
					manifest: singleModuleManifest(`export default {
        async fetch(request, env, ctx) {
			await env.PIPELINE.send([{message: "hello"}]);
            return new Response(null, { status: 204 });
        },
    }`),
					env: { PIPELINE: { type: "pipeline", name: "PIPELINE" } },
				},
			},
		],
	});
	useDispose(mf);

	await mf.dispatchFetch("http://localhost");
});
