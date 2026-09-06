import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject {
	count: number = 0;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		void ctx.blockConcurrencyWhile(async () => {
			this.count = (await ctx.storage.get("count")) ?? 0;
		});
	}

	fetch() {
		this.count++;
		void this.ctx.storage.put("count", this.count);
		return new Response(this.count.toString());
	}
}

export default <ExportedHandler<Env>>{
	fetch(request, env) {
		const { pathname } = new URL(request.url);
		const id = env.COUNTER.idFromName(pathname);
		const stub = env.COUNTER.get(id);
		return stub.fetch(request);
	},
};
