import { DurableObject } from "cloudflare:workers";

interface Env {
	MY_DO: DurableObjectNamespace<MyDO>;
}

// Named export to verify the buffering wrapper re-exports named exports
// (Durable Objects / entrypoints) so bindings still resolve.
export class MyDO extends DurableObject {
	ping(): string {
		return "pong";
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/stream-error") {
			// Emit one chunk (committing status + headers) then error on the next
			// pull, reproducing a render that throws mid-stream.
			let pulls = 0;
			const stream = new ReadableStream({
				pull(controller) {
					if (pulls === 0) {
						controller.enqueue(new TextEncoder().encode("<html><body>partial"));
						pulls++;
						return;
					}
					controller.error(new Error("render boom"));
				},
			});
			return new Response(stream, {
				status: 200,
				headers: { "content-type": "text/html" },
			});
		}

		if (url.pathname === "/intentional-500") {
			return new Response("nope", { status: 500 });
		}

		if (url.pathname === "/do") {
			const stub = env.MY_DO.get(env.MY_DO.idFromName("singleton"));
			return new Response(await stub.ping());
		}

		return new Response("ok");
	},
};
