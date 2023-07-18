import path from "path";
import {
	D1Database,
	D1PreparedStatement,
	D1Result,
} from "@cloudflare/workers-types/experimental/index";
import { Miniflare } from "miniflare";
import { MiniflareTestContext } from "../../test-shared";

export const FIXTURES_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"..",
	"..",
	"test",
	"fixtures"
);

interface D1ExecResult {
	count: number;
	duration: number;
}

const kSend = Symbol("kSend");

// D1-like API for sending requests to the fixture worker. These tests were
// ported from Miniflare 2, which provided this API natively.
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

	// @ts-expect-error this function should return a `Promise<D1ExecResult>`,
	//  not a `Promise<D1Result<T>>`, `@cloudflare/workers-types` is wrong here
	//  TODO(now): fix in `@cloudflare/workers-types`
	async exec(query: string): Promise<D1ExecResult> {
		return this[kSend]("/exec", query);
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

	// TODO(now): fix, this may also return null
	first<T = unknown>(colName?: string): Promise<T> {
		return this.db[kSend](`/prepare/first/${colName ?? ""}`, this);
	}

	run<T = unknown>(): Promise<D1Result<T>> {
		return this.db[kSend]("/prepare/run", this);
	}

	all<T = unknown>(): Promise<D1Result<T>> {
		return this.db[kSend]("/prepare/all", this);
	}

	raw<T = unknown>(): Promise<T[]> {
		return this.db[kSend]("/prepare/raw", this);
	}
}

export const SCHEMA = (tableColours: string, tableKitchenSink: string) => `
CREATE TABLE ${tableColours} (id INTEGER PRIMARY KEY, name TEXT NOT NULL, rgb INTEGER NOT NULL);
CREATE TABLE ${tableKitchenSink} (id INTEGER PRIMARY KEY, int INTEGER, real REAL, text TEXT, blob BLOB);
INSERT INTO ${tableColours} (id, name, rgb) VALUES (1, 'red', 0xff0000);
INSERT INTO ${tableColours} (id, name, rgb) VALUES (2, 'green', 0x00ff00);
INSERT INTO ${tableColours} (id, name, rgb) VALUES (3, 'blue', 0x0000ff);
`;

export interface ColourRow {
	id: number;
	name: string;
	rgb: number;
}

export interface KitchenSinkRow {
	id: number;
	int: number | null;
	real: number | null;
	text: string | null;
	blob: number[] | null;
}

export interface Context extends MiniflareTestContext {
	db: TestD1Database; // TODO(now): swap this back to `D1Database` once types fixed
	tableColours: string;
	tableKitchenSink: string;
}
