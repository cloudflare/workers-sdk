import { Miniflare } from "miniflare";
import { test } from "vitest";
import { useDispose } from "../../test-shared";

test("supports declaring pipelines", async () => {
	const mf = new Miniflare({
		compatibilityDate: "2024-12-30",
		pipelines: ["PIPELINE"],
		modules: true,
		script: `export default {
        async fetch(request, env, ctx) {
			await env.PIPELINE.send([{message: "hello"}]);
            return new Response(null, { status: 204 });
        },
    }`,
	});
	useDispose(mf);

	await mf.dispatchFetch("http://localhost");
});
