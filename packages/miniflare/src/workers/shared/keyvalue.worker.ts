import assert from "node:assert";
import {
	BlobId,
	BlobStore,
	MultipartOptions,
	MultipartReadableStream,
} from "./blob.worker";
import { base64Decode, base64Encode } from "./data";
import { MiniflareDurableObject } from "./object.worker";
import { InclusiveRange } from "./range";
import { all, drain, get, TypedSql } from "./sql.worker";
import { Timers } from "./timers.worker";
import { Awaitable } from "./types";

export interface KeyEntry<Metadata = unknown> {
	key: string;
	expiration?: number; // milliseconds since unix epoch
	metadata?: Metadata;
}
export interface KeyValueEntry<Metadata = unknown> extends KeyEntry<Metadata> {
	value: ReadableStream<Uint8Array>;
}
export interface KeyMultipartValueEntry<Metadata = unknown>
	extends KeyEntry<Metadata> {
	value: MultipartReadableStream;
}

export interface KeyEntriesQuery {
	prefix?: string;
	cursor?: string;
	limit: number;
}
export interface KeyEntries<Metadata = unknown> {
	keys: KeyEntry<Metadata>[];
	cursor?: string;
}

type Row = {
	key: string;
	blob_id: BlobId;
	expiration: number | null; // milliseconds since unix epoch
	metadata: string | null;
};
const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS _mf_entries (
  key TEXT PRIMARY KEY,
  blob_id TEXT NOT NULL,
  expiration INTEGER,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS _mf_entries_expiration_idx ON _mf_entries(expiration);
`;
function sqlStmts(db: TypedSql) {
	const stmtGetBlobIdByKey = db.stmt<Pick<Row, "key">, Pick<Row, "blob_id">>(
		"SELECT blob_id FROM _mf_entries WHERE key = :key"
	);
	const stmtPut = db.stmt<Row>(
		`INSERT OR REPLACE INTO _mf_entries (key, blob_id, expiration, metadata)
    VALUES (:key, :blob_id, :expiration, :metadata)`
	);

	return {
		db,
		getByKey: db.prepare<[key_1: string], Row>(
			"SELECT key, blob_id, expiration, metadata FROM _mf_entries WHERE key = ?1"
		),
		put: db.txn((newEntry: Row) => {
			// TODO(perf): would be really nice if we didn't have to use a transaction
			//  here, need old blob ID for cleanup
			const key = newEntry.key;
			const previousEntry = get(stmtGetBlobIdByKey({ key }));
			stmtPut(newEntry);
			return previousEntry?.blob_id;
		}),
		deleteByKey: db.stmt<Pick<Row, "key">, Pick<Row, "blob_id" | "expiration">>(
			"DELETE FROM _mf_entries WHERE key = :key RETURNING blob_id, expiration"
		),
		deleteExpired: db.stmt<{ now: number }, Pick<Row, "blob_id">>(
			// `expiration` may be `NULL`, but `NULL < ...` should be falsy
			"DELETE FROM _mf_entries WHERE expiration < :now RETURNING blob_id"
		),
		deleteAll: db.prepare<[], Pick<Row, "blob_id">>(
			"DELETE FROM _mf_entries RETURNING blob_id"
		),
		list: db.stmt<
			{
				now: number;
				prefix: string;
				start_after: string;
				limit: number;
			},
			Omit<Row, "blob_id">
		>(
			`SELECT key, expiration, metadata FROM _mf_entries
        WHERE substr(key, 1, length(:prefix)) = :prefix
        AND key > :start_after
        AND (expiration IS NULL OR expiration >= :now)
        ORDER BY key LIMIT :limit`
		),
	};
}

function rowEntry<Metadata>(entry: Omit<Row, "blob_id">): KeyEntry<Metadata> {
	return {
		key: entry.key,
		expiration: entry.expiration ?? undefined,
		metadata: entry.metadata === null ? undefined : JSON.parse(entry.metadata),
	};
}

export type KeyValueRangesFactory<Metadata> = (
	metadata: Metadata
) => { ranges?: InclusiveRange[] } & MultipartOptions;

export class KeyValueStorage<Metadata = unknown> {
	readonly #stmts: ReturnType<typeof sqlStmts>;
	readonly #blob: BlobStore;
	readonly #timers: Timers;

	constructor(object: MiniflareDurableObject) {
		object.db.exec("PRAGMA case_sensitive_like = TRUE");
		object.db.exec(SQL_SCHEMA);
		this.#stmts = sqlStmts(object.db);
		this.#blob = object.blob;
		this.#timers = object.timers;
	}

	#hasExpired(entry: Pick<Row, "expiration">) {
		return entry.expiration !== null && entry.expiration <= this.#timers.now();
	}

	#backgroundDelete(blobId: string) {
		// Once rows are deleted, or if they failed to insert, we delete the
		// corresponding blobs in the background, ignoring errors. Blob IDs are
		// unguessable, so if there aren't any references to them, they can't be
		// accessed. This means if we fail to delete a blob for any reason, it
		// doesn't matter, we'll just have a dangling file taking up disk space.
		this.#timers.queueMicrotask(() =>
			this.#blob.delete(blobId).catch(() => {})
		);
	}

	get(key: string): Promise<KeyValueEntry<Metadata> | null>;
	get(
		key: string,
		optsFactory?: KeyValueRangesFactory<Metadata>
	): Promise<KeyMultipartValueEntry<Metadata> | null>;
	async get(
		key: string,
		optsFactory?: KeyValueRangesFactory<Metadata>
	): Promise<
		KeyValueEntry<Metadata> | KeyMultipartValueEntry<Metadata> | null
	> {
		// Try to get key from metadata store, returning null if not found
		const row = get(this.#stmts.getByKey(key));
		if (row === undefined) return null;

		if (this.#hasExpired(row)) {
			// If expired, delete from metadata and blob stores. Assuming a
			// monotonically increasing clock, this doesn't need to be in a
			// transaction with the above get. If we call `get()` again, the current
			// time will be >= now, so the entry will still be expired. Trying to
			// delete an already deleted row won't do anything, and we'll ignore the
			// blob not found error.
			// TODO(cleanup): once https://github.com/cloudflare/workerd/issues/959
			//  is fixed, should be able to remove `drain()`
			drain(this.#stmts.deleteByKey({ key }));
			// Garbage collect expired blob
			this.#backgroundDelete(row.blob_id);
			return null;
		}

		// Return the blob as a stream
		const entry = rowEntry<Metadata>(row);
		const opts = entry.metadata && optsFactory?.(entry.metadata);
		if (opts?.ranges === undefined || opts.ranges.length <= 1) {
			// If no range was requested, or just a single one was, return a regular
			// stream
			const value = await this.#blob.get(row.blob_id, opts?.ranges?.[0]);
			if (value === null) return null;
			return { ...entry, value };
		} else {
			// Otherwise, if multiple ranges were requested, return a multipart stream
			const value = await this.#blob.get(row.blob_id, opts.ranges, opts);
			if (value === null) return null;
			return { ...entry, value };
		}
	}

	async put(
		entry: KeyValueEntry<Awaitable<Metadata>> & { signal?: AbortSignal }
	): Promise<void> {
		// (NOTE: `Awaitable` allows metadata to be a `Promise`, this is used by
		// the `CacheObject` to include `size` in the metadata, which may only be
		// known once the stream is written to the blob store if no `Content-Length`
		// header was specified)

		// Empty keys are not permitted because we default to starting after "" when
		// listing. See `list()` for more details.
		assert(entry.key !== "");

		// Write the value to the blob store. Note we don't abort the put until
		// after it's fully completed. This ensures "too large" error messages that
		// measure the length of the stream using a `TransformStream` see the full
		// value, and can include the correct number of bytes in the message.
		const blobId = await this.#blob.put(entry.value);
		if (entry.signal?.aborted) {
			this.#backgroundDelete(blobId);
			entry.signal.throwIfAborted();
		}

		// Put new entry into metadata store, returning old entry's blob ID if any
		const maybeOldBlobId = this.#stmts.put({
			key: entry.key,
			blob_id: blobId,
			expiration: entry.expiration ?? null,
			metadata:
				entry.metadata === undefined
					? null
					: JSON.stringify(await entry.metadata),
		});
		// Garbage collect previous entry's blob
		if (maybeOldBlobId !== undefined) this.#backgroundDelete(maybeOldBlobId);
	}

	async delete(key: string): Promise<boolean> {
		// Try to delete key from metadata store, returning false if not found
		const cursor = this.#stmts.deleteByKey({ key });
		const row = get(cursor);
		if (row === undefined) return false;
		// Garbage collect deleted entry's blob
		this.#backgroundDelete(row.blob_id);
		// Return true iff this entry hasn't expired
		return !this.#hasExpired(row);
	}

	deleteAll(): number {
		// Get all blob IDs and delete all entries in one statement
		const rows = all(this.#stmts.deleteAll());

		// Garbage collect all blobs in the background
		for (const { blob_id } of rows) {
			this.#backgroundDelete(blob_id);
		}

		return rows.length;
	}

	async list(opts: KeyEntriesQuery): Promise<KeyEntries<Metadata>> {
		// Find non-expired entries matching query after cursor
		const now = this.#timers.now();
		const prefix = opts.prefix ?? "";
		// Note the "" default here prohibits empty string keys. The consumers
		// of this class are KV and Cache. KV validates keys are non-empty.
		// Cache keys are usually URLs, but can be customised with `cf.cacheKey`.
		// If this is empty, we can just not cache the response, since that
		// satisfies the Cache API contract.
		const start_after =
			opts.cursor === undefined ? "" : base64Decode(opts.cursor);
		// Increase the queried limit by 1, if we return this many results, we
		// know there are more rows. We'll truncate to the original limit before
		// returning results.
		const limit = opts.limit + 1;
		const rowsCursor = this.#stmts.list({
			now,
			prefix,
			start_after,
			limit,
		});
		const rows = Array.from(rowsCursor);

		// Garbage collect expired entries. As with `get()`, assuming a
		// monotonically increasing clock, this doesn't need to be in a transaction.
		const expiredRows = this.#stmts.deleteExpired({ now });
		for (const row of expiredRows) this.#backgroundDelete(row.blob_id);

		// If there are more results, we'll be returning a cursor
		const hasMoreRows = rows.length === opts.limit + 1;
		rows.splice(opts.limit, 1);

		const keys = rows.map((row) => rowEntry<Metadata>(row));

		// The cursor encodes a key to start after rather than the key to start at
		// to ensure keys added between `list()` calls are returned.
		const nextCursor = hasMoreRows
			? base64Encode(rows[opts.limit - 1].key)
			: undefined;

		return { keys, cursor: nextCursor };
	}
}
