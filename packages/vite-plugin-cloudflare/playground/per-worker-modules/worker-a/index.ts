import { env, WorkerEntrypoint } from "cloudflare:workers/worker-a";
import { greet } from "../shared/greet";

export default class extends WorkerEntrypoint {
	override async fetch(request: Request) {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/module-env":
				return new Response(env.GREETING);
			case "/worker-b":
				return this.env.WORKER_B.fetch(request);
			default:
				return new Response(greet(this.env));
		}
	}
}
