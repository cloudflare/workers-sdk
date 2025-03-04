import { WorkerEntrypoint } from "cloudflare:workers";

export interface Env {
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	ASSETS: Fetcher;
	NAMED: Fetcher<NamedEntrypoint>;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/assets-binding") {
			return await env.ASSETS.fetch(new URL("binding.html", request.url));
		}

		if (url.pathname === "/named-entrypoint") {
			const res = await env.NAMED.sayHello();
			return new Response(res);
		}
		// 404s from the Asset Worker will return this:
		return new Response(
			"There were no assets at this route! Hello from the user Worker instead!" +
				`\n${new Date()}`
		);
	},
};

export class NamedEntrypoint extends WorkerEntrypoint {
	async sayHello() {
		return "hello from a named entrypoint";
	}
}
