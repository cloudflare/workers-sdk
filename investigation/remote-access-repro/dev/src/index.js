// Dev worker for the remote-bindings Access repro. Run with `wrangler dev`.
//
// A single GET to this worker exercises BOTH remote-binding proxy code paths
// independently and reports the outcome of each, so one request tells us which
// path works/fails and why:
//
//   - `ai`           → HTTP `makeFetch` path  (wrapped-fetcher binding; the
//                       AI `invalid_token` case reported in PR #14198)
//   - `serviceFetch` → HTTP `makeFetch` path  (service binding `.fetch`)
//   - `rpc`          → WebSocket `makeRemoteProxyStub` path (capnweb RPC; the
//                       Artifacts/service-RPC case reported in PR #14198)
//
// See ../README.md for the run protocol and how to read the results.

async function settle(path, fn) {
	try {
		return { path, ok: true, result: await fn() };
	} catch (e) {
		return { path, ok: false, error: e && e.message ? e.message : String(e) };
	}
}

export default {
	async fetch(_request, env) {
		const report = {
			ai: await settle("http/makeFetch (AI)", () =>
				env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
					messages: [{ role: "user", content: "Reply with the word: ok" }],
				})
			),
			serviceFetch: await settle("http/makeFetch (service.fetch)", async () => {
				const res = await env.TARGET.fetch("http://example.com");
				return await res.text();
			}),
			rpc: await settle("ws/makeRemoteProxyStub (service RPC)", () =>
				env.TARGET.add(1, 2)
			),
		};
		return Response.json(report);
	},
};
