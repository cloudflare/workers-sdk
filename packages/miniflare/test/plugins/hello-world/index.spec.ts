import { Miniflare } from "miniflare";
import { expect, test } from "vitest";
import { useDispose } from "../../test-shared";

test("hello-world", async () => {
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
	useDispose(mf);

	const response1 = await mf.dispatchFetch("http://placeholder");

	expect(await response1.text()).toBe("Not found");
	expect(response1.status).toBe(404);

	const response2 = await mf.dispatchFetch("http://placeholder", {
		method: "POST",
		body: "hello world",
	});

	expect(await response2.json()).toEqual({ value: "hello world", ms: 100 });
	expect(response2.status).toBe(200);

	const response3 = await mf.dispatchFetch("http://placeholder");

	expect(await response3.json()).toEqual({ value: "hello world", ms: 100 });
	expect(response3.status).toBe(200);

	const response4 = await mf.dispatchFetch("http://placeholder", {
		method: "POST",
		body: "",
	});

	expect(await response4.text()).toBe("Not found");
	expect(response4.status).toBe(404);
});
