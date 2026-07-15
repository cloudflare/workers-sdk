import { DurableObject } from "cloudflare:workers";

interface Env {
	COUNTER_A: DurableObjectNamespace<CounterA>;
	COUNTER_B: DurableObjectNamespace<CounterB>;
}

class SqlCounter extends DurableObject<Env> {
	private readonly ready: Promise<void>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ready = this.init();
	}

	private async init() {
		this.ctx.storage.sql.exec(
			"CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)"
		);
		this.ctx.storage.sql.exec(
			"INSERT OR IGNORE INTO counter (id, value) VALUES (1, 0)"
		);
	}

	async value(): Promise<number> {
		await this.ready;
		const row = this.ctx.storage.sql
			.exec<{ value: number }>("SELECT value FROM counter WHERE id = 1")
			.one();
		return row.value;
	}

	async increment(): Promise<number> {
		await this.ready;
		this.ctx.storage.sql.exec(
			"UPDATE counter SET value = value + 1 WHERE id = 1"
		);
		return this.value();
	}

	async sqliteOk(): Promise<number> {
		const row = this.ctx.storage.sql
			.exec<{ ok: number }>("SELECT 1 AS ok")
			.one();
		return row.ok;
	}
}

export class CounterA extends SqlCounter {}
export class CounterB extends SqlCounter {}
// CounterC has no binding in `wrangler.jsonc`; it is reached via `ctx.exports`.
export class CounterC extends SqlCounter {}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);
		const [, scope, action] = url.pathname.split("/");

		let namespace: DurableObjectNamespace<SqlCounter> | undefined;
		if (scope === "a") {
			namespace = env.COUNTER_A;
		} else if (scope === "b") {
			namespace = env.COUNTER_B;
		} else if (scope === "c") {
			namespace = ctx.exports.CounterC;
		}
		if (!namespace) {
			return new Response(
				"Use /a/... or /b/... or /c/... to address a counter.",
				{ status: 400 }
			);
		}

		const instance = url.searchParams.get("instance") ?? "default";
		const stub = namespace.getByName(instance);

		switch (action) {
			case "":
			case undefined:
				return Response.json({ value: await stub.value() });
			case "increment":
				return Response.json({ value: await stub.increment() });
			case "sqlite-check":
				return Response.json({ ok: await stub.sqliteOk() });
			default:
				return new Response("not found", { status: 404 });
		}
	},
};
