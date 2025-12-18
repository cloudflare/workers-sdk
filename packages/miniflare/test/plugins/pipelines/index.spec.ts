import { Miniflare } from "miniflare";
import { expect, onTestFinished, test } from "vitest";

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
	onTestFinished(() => mf.dispose());

	await mf.dispatchFetch("http://localhost");
	expect(true).toBeTruthy();
});
