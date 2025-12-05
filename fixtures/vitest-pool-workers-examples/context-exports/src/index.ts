import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (pathname === "/durable-object") {
			const id = ctx.exports.Counter.idFromName(pathname);
			const stub = ctx.exports.Counter.get(id);
			return stub.fetch(request);
		}
		if (pathname === "/props") {
			return new Response(
				"👋 " +
					(await ctx.exports
						.NamedEntryPoint({ props: { extra: "\nAdditional props!!" } })
						.greet())
			);
		}
		return new Response("👋 " + (await ctx.exports.NamedEntryPoint.greet()));
	},
} satisfies ExportedHandler;

export class NamedEntryPoint extends WorkerEntrypoint<Env, { extra?: string }> {
	greet() {
		return (
			`Hello ${this.env.NAME} from Main NamedEntryPoint!` +
			(this.ctx.props.extra ?? "")
		);
	}
}

export class Counter extends DurableObject {
	count: number = 0;

	increment(by = 1) {
		this.count += by;
		void this.ctx.storage.put("count", this.count);
	}

	fetch(request: Request) {
		this.increment();
		return new Response(this.count.toString());
	}
}
