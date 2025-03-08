import test from "ava";
import { Miniflare } from "miniflare";

test("secret-store", async (t) => {
	const mf = new Miniflare({
		verbose: true,

		secretStores: {
			SECRET: {
				storeId: "store_id",
				name: "secret_name",
			},
		},

		modules: true,
		script: `
		export default {
			async fetch(request, env, ctx) {
				const value = await env.SECRET.get();
				return new Response(value);
			},
		}
		`,
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	t.is(await response.text(), "secret_name");
});
