import test from "ava";
import { Miniflare } from "miniflare";

test("supports declaring pipelines", async (t) => {
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
	t.teardown(() => mf.dispose());

	await mf.dispatchFetch("http://localhost");
	t.assert(true);
});
