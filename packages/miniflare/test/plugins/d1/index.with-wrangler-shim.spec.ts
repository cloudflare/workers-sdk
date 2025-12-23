import type {
	D1Database,
	D1DatabaseSession,
	D1ExecResult,
	D1PreparedStatement,
	D1Result,
	D1SessionBookmark,
	D1SessionConstraint,
} from "@cloudflare/workers-types/experimental";
import type { Miniflare } from "miniflare";
// Import suite tests - this registers the tests with vitest
import "./suite";
import { setupTest } from "./test";

const kSend = Symbol("kSend");

// D1-like API for sending requests to the fixture worker. Note we can't use the
// API proxy here, as without the wrapped binding we only get a `Fetcher`.
export class TestD1Database implements D1Database {
	constructor(private readonly mf: Miniflare) {}

	prepare(query: string) {
		return new TestD1PreparedStatement(this, query);
	}

	async dump(): Promise<ArrayBuffer> {
		const res = await this.mf.dispatchFetch(`http://localhost/dump`);
		return res.arrayBuffer();
	}

	async [kSend](pathname: string, body: any): Promise<any> {
		if (typeof body !== "string") body = JSON.stringify(body);
		const res = await this.mf.dispatchFetch(`http://localhost${pathname}`, {
			method: "POST",
			body: body,
			headers: { Accept: "text/plain" },
		});
		return res.json();
	}

	batch<T = unknown>(
		statements: D1PreparedStatement[]
	): Promise<D1Result<T>[]> {
		return this[kSend]("/batch", statements);
	}

	async exec(query: string): Promise<D1ExecResult> {
		return this[kSend]("/exec", query);
	}

	withSession(
		_constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint
	): D1DatabaseSession {
		throw new Error("Method not implemented for D1 Wrangler shim.");
	}
}

class TestD1PreparedStatement implements D1PreparedStatement {
	constructor(
		private readonly db: TestD1Database,
		private readonly sql: string,
		private readonly params?: any[]
	) {}

	toJSON() {
		return { sql: this.sql, params: this.params };
	}

	bind(...params: any[]): D1PreparedStatement {
		return new TestD1PreparedStatement(this.db, this.sql, params);
	}

	first<T = unknown>(colName?: string): Promise<T> {
		return this.db[kSend](`/prepare/first/${colName ?? ""}`, this);
	}

	run<T = unknown>(): Promise<D1Result<T>> {
		return this.db[kSend]("/prepare/run", this);
	}

	all<T = unknown>(): Promise<D1Result<T>> {
		return this.db[kSend]("/prepare/all", this);
	}

	raw<T = unknown>(): Promise<[string[], ...T[]]> {
		return this.db[kSend]("/prepare/raw", this);
	}
}

// Pre-wrangler 3.3, D1 bindings needed a local compilation step, so use
// the output version of the fixture, and the appropriately prefixed binding name
setupTest(
	"__D1_BETA__DB",
	"worker.dist.mjs",
	async (mf) => new TestD1Database(mf)
);
