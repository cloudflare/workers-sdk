import { Miniflare } from "miniflare";
import { test } from "vitest";
import { useDispose } from "../../test-shared";

test("flagship", async ({ expect }) => {
	const mf = new Miniflare({
		compatibilityDate: "2025-01-01",
		flagship: {
			FLAGS: {
				app_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			},
		},
		modules: true,
		script: `
			export default {
				async fetch(request, env, ctx) {
					const url = new URL(request.url);

					if (url.pathname === "/boolean") {
						const value = await env.FLAGS.getBooleanValue("my-flag", false);
						return Response.json({ value });
					}

					if (url.pathname === "/string") {
						const value = await env.FLAGS.getStringValue("variant", "control", {
							userId: "user-123",
						});
						return Response.json({ value });
					}

					if (url.pathname === "/number") {
						const value = await env.FLAGS.getNumberValue("rate-limit", 100);
						return Response.json({ value });
					}

					if (url.pathname === "/details") {
						const details = await env.FLAGS.getBooleanDetails("my-flag", true);
						return Response.json(details);
					}

					if (url.pathname === "/get") {
						const value = await env.FLAGS.get("any-flag", "fallback");
						return Response.json({ value });
					}

					return new Response("Not found", { status: 404 });
				},
			}
		`,
	});
	useDispose(mf);

	// Local stub returns the default value for all evaluations
	const boolRes = await mf.dispatchFetch("http://placeholder/boolean");
	expect(await boolRes.json()).toEqual({ value: false });

	const strRes = await mf.dispatchFetch("http://placeholder/string");
	expect(await strRes.json()).toEqual({ value: "control" });

	const numRes = await mf.dispatchFetch("http://placeholder/number");
	expect(await numRes.json()).toEqual({ value: 100 });

	const detailsRes = await mf.dispatchFetch("http://placeholder/details");
	expect(await detailsRes.json()).toEqual({
		flagKey: "my-flag",
		value: true,
		reason: "DEFAULT",
	});

	const getRes = await mf.dispatchFetch("http://placeholder/get");
	expect(await getRes.json()).toEqual({ value: "fallback" });
});
