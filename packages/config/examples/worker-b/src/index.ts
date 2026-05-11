import { env, WorkerEntrypoint, DurableObject } from "cloudflare:workers";

export class MyEntrypoint extends WorkerEntrypoint {
	add(a: number, b: number) {
		return a + b;
	}
}

export class MyDurableObject extends DurableObject {
	greet(name: string) {
		return `Hello ${name}`;
	}
}

export default {
	async fetch() {
		const result = await env.WORKER_A_ENTRYPOINT.add(1, 2);
		return new Response(`${result}`);
	},
} satisfies ExportedHandler<Env>;
