// Durable Object backing the emulated Ratelimit binding.
//
// Counters live in `state.storage` (SQLite on disk, see the `ratelimit` plugin)
// rather than on the heap, because `workerd` evicts idle Durable Objects after
// ~10s and heap state would take the counters with it, silently resetting the
// limit part way through a window.
//
// Durable storage is still cleared by `deleteAllDurableObjects()`, so
// vitest-pool-workers' `reset()` clears it for free — the same mechanism that
// resets the KV, R2 and D1 simulators.
import { drain, get, MiniflareDurableObject, POST } from "miniflare:shared";
import type { RouteHandler, TypedSql } from "miniflare:shared";

interface LimitRequestBody {
	key: string;
	limit: number;
	period: number;
}

interface LimitResult {
	success: boolean;
}

// One counter per key, shared by every binding pointing at this namespace.
// `period` is a property of the namespace rather than of an individual call, so
// it deliberately isn't part of the key: bindings that share a `namespace_id`
// are documented to share counters for a given key.
type BucketRow = {
	key: string;
	epoch: number;
	count: number;
};

const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS _mf_ratelimit_buckets (
  key TEXT PRIMARY KEY,
  epoch INTEGER NOT NULL,
  count INTEGER NOT NULL
);
`;

function sqlStmts(db: TypedSql) {
	return {
		getBucket: db.stmt<Pick<BucketRow, "key">, BucketRow>(
			"SELECT key, epoch, count FROM _mf_ratelimit_buckets WHERE key = :key"
		),
		putBucket: db.stmt<BucketRow>(
			`INSERT OR REPLACE INTO _mf_ratelimit_buckets (key, epoch, count)
        VALUES (:key, :epoch, :count)`
		),
		// Windows are aligned to the wall clock, so every key in the namespace
		// rolls over at the same instant. Clearing them all together matches the
		// previous `#buckets.clear()` and stops the table growing without bound.
		deleteExpired: db.stmt<Pick<BucketRow, "epoch">>(
			"DELETE FROM _mf_ratelimit_buckets WHERE epoch != :epoch"
		),
	};
}

export class RateLimiterObject extends MiniflareDurableObject {
	#stmts?: ReturnType<typeof sqlStmts>;
	get stmts() {
		if (this.#stmts === undefined) {
			this.db.exec(SQL_SCHEMA);
			this.#stmts = sqlStmts(this.db);
		}
		return this.#stmts;
	}

	@POST("/limit")
	limit: RouteHandler = async (req) => {
		const { key, limit, period } = await req.json<LimitRequestBody>();

		const epoch = Math.floor(Date.now() / (period * 1000));
		const bucket = get(this.stmts.getBucket({ key }));

		let count = 0;
		if (bucket !== undefined && bucket.epoch === epoch) {
			count = bucket.count;
		} else {
			drain(this.stmts.deleteExpired({ epoch }));
		}

		if (count >= limit) {
			return Response.json({ success: false } satisfies LimitResult);
		}
		this.stmts.putBucket({ key, epoch, count: count + 1 });
		return Response.json({ success: true } satisfies LimitResult);
	};
}
