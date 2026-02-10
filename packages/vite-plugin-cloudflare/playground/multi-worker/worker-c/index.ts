import type WorkerD from "../worker-d";

interface Env {
	WORKER_D: Fetcher<WorkerD>;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/fetch": {
				const response = await env.WORKER_D.fetch(request);
				const result = await response.json();
				return Response.json({ result });
			}
			case "/rpc-method": {
				const result = await env.WORKER_D.multiply(3, 7);
				return Response.json({ result });
			}
		}

		return Response.json({ name: "Worker C (no config file)" });
	},
} satisfies ExportedHandler<Env>;
