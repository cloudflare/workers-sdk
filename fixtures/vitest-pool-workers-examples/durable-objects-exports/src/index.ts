import { DurableObject } from "cloudflare:workers";

class SqlCounter extends DurableObject<Env> {
	count: number = 0;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		void ctx.blockConcurrencyWhile(async () => {
			this.count = (await ctx.storage.get("count")) ?? 0;
		});
	}

	increment(by = 1) {
		this.count += by;
		void this.ctx.storage.put("count", this.count);
		return this.count;
	}

	// Touches the SQLite-backed API so callers can confirm the class is
	// provisioned with `storage: "sqlite"` (this throws on a legacy-KV DO).
	sqliteOk() {
		return this.ctx.storage.sql.databaseSize;
	}
}

// Bound class — has a `durable_objects.bindings` entry.
export class Counter extends SqlCounter {
	fetch(_request: Request) {
		return new Response(this.increment().toString());
	}
}

// Unbound class — declared only via `exports`, reached via `ctx.exports`.
export class UnboundCounter extends SqlCounter {
	fetch(_request: Request) {
		return new Response(this.increment().toString());
	}
}

export default <ExportedHandler<Env>>{
	fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname === "/unbound") {
			const id = ctx.exports.UnboundCounter.idFromName("/unbound");
			const stub = ctx.exports.UnboundCounter.get(id);
			return stub.fetch(request);
		}
		const id = env.COUNTER.idFromName(url.pathname);
		const stub = env.COUNTER.get(id);
		return stub.fetch(request);
	},
};
