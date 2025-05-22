import test from "ava";
import { Miniflare, MiniflareOptions } from "miniflare";

const SCRIPT = () => `
  export default {
	async fetch(request, env, ctx) {
		return new Response("hi")
	},
  };`;

test("starts a container service", async (t) => {
	const opts: MiniflareOptions = {
		name: "worker",
		compatibilityDate: "2024-11-20",
		modules: true,
		script: SCRIPT(),
		containers: {
			MY_CONTAINER: {
				image: "hi",
				class_name: "MyContainer",
			},
		},
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "hi");
});
