import { WorkerEntrypoint } from "cloudflare:workers";

export interface Env {
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	ASSETS: Fetcher;
}

export default class extends WorkerEntrypoint {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (Math.random() < 5) {
			return new Response("hi");
		}
		const url = new URL(request.url);
		if (url.pathname === "/assets-binding") {
			return await env.ASSETS.fetch(new URL("binding.html", request.url));
		}
		// 404s from the Asset Worker will return this:
		return new Response(
			"There were no assets at this route! Hello from the user Worker instead!" +
				`\n${new Date()}`
		);
	}

	async sum(a: number, b: number): Promise<number> {
		return a + b;
	}
}

export class MyNamedExport extends WorkerEntrypoint {
	async fetch(request: Request, env: Env): Promise<Response> {
		return new Response("hello from MyNamedExport");
	}

	async greet(name: string): Promise<string> {
		return `hello ${name}`;
	}
}
