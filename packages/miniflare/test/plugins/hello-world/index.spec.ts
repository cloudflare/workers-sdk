import test from "ava";
import { Miniflare } from "miniflare";

test("hello-world", async (t) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		helloWorld: {
			BINDING: {
				enable_timer: true,
			},
		},
		helloWorldPersist: false,
		modules: true,
		script: `
            export default {
                async fetch(request, env, ctx) {
                    if (request.method === "POST") {
                        await env.BINDING.set(await request.text());
                    }
                    const result = await env.BINDING.get();
                    if (!result.value) {
                        return new Response('Not found', { status: 404 });
                    }
                    return Response.json(result);
                },
            }
		`,
	});
	t.teardown(() => mf.dispose());

	const response1 = await mf.dispatchFetch("http://placeholder");

	t.is(await response1.text(), "Not found");
	t.is(response1.status, 404);

	const response2 = await mf.dispatchFetch("http://placeholder", {
		method: "POST",
		body: "hello world",
	});

	t.deepEqual(await response2.json(), { value: "hello world", ms: 100 });
	t.is(response2.status, 200);

	const response3 = await mf.dispatchFetch("http://placeholder");

	t.deepEqual(await response3.json(), { value: "hello world", ms: 100 });
	t.is(response3.status, 200);

	const response4 = await mf.dispatchFetch("http://placeholder", {
		method: "POST",
		body: "",
	});

	t.is(await response4.text(), "Not found");
	t.is(response4.status, 404);
});
