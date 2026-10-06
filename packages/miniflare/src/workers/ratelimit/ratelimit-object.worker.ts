// Durable Object backing the emulated Ratelimit binding.
//
// Counters live in `state.storage` (SQLite on disk, see the `ratelimit` plugin)
// rather than on the heap, because `workerd` evicts idle Durable Objects after
// ~10s and heap state would take the counters with it, silently resetting the
// limit part way through a window.
//
// Durable storage is still cleared by `deleteAllDurableObjects()`, so
// vitest-plugin's `reset()` clears it for free — the same mechanism that
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

// Counters are scoped to `(key, period)`, mirroring production: there, an entry
// is identified by `(account_id, namespace, hash(key), bucket, bucket_start_ts)`
// and both `bucket` and `bucket_start_ts` are derived from the period, so
// differing periods never share a counter. See
// https://gitlab.cfdata.org/cloudflare/egs/doppler/-/blob/main/doppler-lib/src/counts.rs
//
// Bindings that share a `namespace_id` still share a counter for a given key,
// because in the normal case they also share a period. Were `period` left out of
// the key, two such bindings configured with different periods would instead
// overwrite each other's row on every call — each seeing a foreign epoch, so
// each resetting the count to zero — and neither would ever limit anything.
//
// Note the limit itself is deliberately *not* part of the key, again matching
// production, where it is a threshold applied to a shared count rather than part
// of the counter's identity.
type BucketRow = {
	key: string;
	period: number;
	epoch: number;
	count: number;
};

const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS _mf_ratelimit_buckets (
  key TEXT NOT NULL,
  period INTEGER NOT NULL,
  epoch INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, period)
);
`;

function sqlStmts(db: TypedSql) {
	return {
		getBucket: db.stmt<Pick<BucketRow, "key" | "period">, BucketRow>(
			`SELECT key, period, epoch, count FROM _mf_ratelimit_buckets
        WHERE key = :key AND period = :period`
		),
		putBucket: db.stmt<BucketRow>(
			`INSERT OR REPLACE INTO _mf_ratelimit_buckets (key, period, epoch, count)
        VALUES (:key, :period, :epoch, :count)`
		),
		// Windows are aligned to the wall clock, so every key sharing a period
		// rolls over at the same instant. Clearing them all together matches the
		// previous `#buckets.clear()` and stops the table growing without bound.
		// It has to stay scoped to the period, or rolling one period's window over
		// would discard the counters belonging to the other.
		deleteExpired: db.stmt<Pick<BucketRow, "period" | "epoch">>(
			"DELETE FROM _mf_ratelimit_buckets WHERE period = :period AND epoch != :epoch"
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
		const bucket = get(this.stmts.getBucket({ key, period }));

		let count = 0;
		if (bucket !== undefined && bucket.epoch === epoch) {
			count = bucket.count;
		} else {
			drain(this.stmts.deleteExpired({ period, epoch }));
		}

		if (count >= limit) {
			return Response.json({ success: false } satisfies LimitResult);
		}
		this.stmts.putBucket({ key, period, epoch, count: count + 1 });
		return Response.json({ success: true } satisfies LimitResult);
	};
}
