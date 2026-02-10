import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

// This re-export will not be detected by the export guessing logic
export * from "@virtual-module";

// This explicit re-export will be detected by the export guessing logic
// even though it won't be able to tell what it is at build time.
export { ExplicitVirtualEntryPoint } from "@virtual-module";

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
		if (pathname === "/invalid-export") {
			// @ts-expect-error we are testing invalid export access
			return new Response("👋 " + (await ctx.exports.InvalidExport));
		}

		if (pathname === "/virtual-implicit") {
			// We don't try to call greet() here because the entry-point will be undefined.
			return new Response("👋 " + ctx.exports.ReexportedVirtualEntryPoint);
		}

		if (pathname === "/virtual-explicit") {
			return new Response(
				"👋 " + (await ctx.exports.ExplicitVirtualEntryPoint.greet())
			);
		}

		if (pathname === "/virtual-configured") {
			return new Response(
				"👋 " + (await ctx.exports.ConfiguredVirtualEntryPoint.greet())
			);
		}

		if (pathname === "/virtual-durable-object") {
			const id = ctx.exports.ConfiguredVirtualDurableObject.newUniqueId();
			const stub = ctx.exports.ConfiguredVirtualDurableObject.get(id);
			return new Response("👋 " + (await stub.greet()));
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
