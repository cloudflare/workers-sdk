import test from "ava";
import { Miniflare, MiniflareOptions } from "miniflare";

const BROWSER_WORKER_SCRIPT = () => `
export default {
	async fetch(request, env) {
		console.log(env.MYBROWSER);
		if (request.url.endsWith("session")) {
			const newBrowserSession = await env.MYBROWSER.fetch("https://localhost/v1/acquire")
			return new Response(await newBrowserSession.text())
		} else if (request.url.endsWith("browserWSEndpoint")) {
		 	const newBrowserSession = await env.MYBROWSER.fetch("https://localhost/v1/acquire")
			return new Response(await env.MYBROWSER.browserWSEndpoint)
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
		browser: "MYBROWSER",
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	try {
		const res = await mf.dispatchFetch("https://localhost/session");
		t.is(await res.text(), '{"sessionId":0}');
	} catch (err) {
		console.error(err);
		t.is("true", "false");
	}
});

test("it opens a ws connection", async (t) => {
	const opts: MiniflareOptions = {
		name: "worker",
		compatibilityDate: "2024-11-20",
		modules: true,
		script: BROWSER_WORKER_SCRIPT(),
		browser: "MYBROWSER",
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	try {
		const res = await mf.dispatchFetch("https://localhost/browserWSEndpoint");
		const re = /ws:\/\/127.0.0.1:\d*\/devtools\/browser\/[\w-]*/;
		t.regex(await res.text(), re);
	} catch (err) {
		console.error(err);
		t.is("true", "false");
	}
});
