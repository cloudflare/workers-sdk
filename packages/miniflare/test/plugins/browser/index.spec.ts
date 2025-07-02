import test from "ava";
import { Miniflare, MiniflareOptions } from "miniflare";

const BROWSER_WORKER_SCRIPT = () => `
export default {
	async fetch(request, env) {
		if (request.url.endsWith("session")) {
			const newBrowserSession = await env.MYBROWSER.fetch("https://localhost/v1/acquire")
			return new Response(await newBrowserSession.text())
		}
	}
};
`;

test("it creates a browser session", async (t) => {
	const opts: MiniflareOptions = {
		name: "worker",
		compatibilityDate: "2024-11-20",
		modules: true,
		script: BROWSER_WORKER_SCRIPT(),
		browserRendering: { binding: "MYBROWSER" },
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://localhost/session");
	t.assert((await res.text()).includes("sessionId"));
});
