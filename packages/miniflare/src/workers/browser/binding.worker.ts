import { CoreBindings } from "../core/constants";
import type { Fetcher } from "@cloudflare/workers-types/experimental";

export default function (env: { [CoreBindings.SERVICE_LOOPBACK]: Fetcher }) {
	let wsEndpoint: string | undefined;
	return {
		async fetch(request: string) {
			const url = new URL(request);
			if (url.pathname === "/v1/acquire") {
				const resp = await env[CoreBindings.SERVICE_LOOPBACK].fetch(
					"http://example.com/browser/launch"
				);
				wsEndpoint = await resp.text();
				return Response.json({ sessionId: 0 });
			}
		},
		get browserWSEndpoint() {
			return wsEndpoint;
		},
	};
}
