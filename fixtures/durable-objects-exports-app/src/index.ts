import { DurableObject } from "cloudflare:workers";

interface Env {
	// CounterA and CounterB are accessed via traditional bindings.
	COUNTER_A: DurableObjectNamespace<CounterA>;
	COUNTER_B: DurableObjectNamespace<CounterB>;
	// CounterC is intentionally NOT bound here — it's reached through
	// `ctx.exports.CounterC` (see below). The DO class is still declared
	// via the new `exports` map in `wrangler.jsonc` so its lifecycle is
	// managed declaratively.
}

/**
 * Base counter implementation backed by SQLite. The `ctx.storage.sql.exec`
 * call only works when the class has been provisioned with SQLite storage —
 * with the declarative `exports` config that means `storage: "sqlite"` on a
 * live (`state: "created"`) entry.
 */
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

	/**
	 * Returns the result of a trivial SQL query. Used by the diagnostic
	 * endpoint to prove the class is on the SQLite-backed storage engine —
	 * the call fails if the namespace was provisioned as legacy KV.
	 */
	async sqliteOk(): Promise<number> {
		const row = this.ctx.storage.sql
			.exec<{ ok: number }>("SELECT 1 AS ok")
			.one();
		return row.ok;
	}
}

export class CounterA extends SqlCounter {}
export class CounterB extends SqlCounter {}
// CounterC is exported here but has no binding in `wrangler.jsonc`. It is
// addressed at runtime via `ctx.exports.CounterC`, which is typed by the
// `Cloudflare.GlobalProps.durableNamespaces` union that `wrangler types`
// generates from the live `exports` entries.
export class CounterC extends SqlCounter {}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);
		const [, scope, action] = url.pathname.split("/");

		// `/a/...` and `/b/...` resolve through traditional bindings on
		// `env`. `/c/...` resolves through `ctx.exports.CounterC` — the
		// "unbound DO" recipe enabled by the declarative `exports` config.
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

		// Callers can pass `?instance=...` to address a specific DO instance;
		// tests use this to isolate state between runs. Falls back to a
		// single `default` instance so the fixture is friendly to manual
		// curl probing.
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
