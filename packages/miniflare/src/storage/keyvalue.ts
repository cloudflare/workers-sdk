import assert from "assert";
import { ReadableStream } from "stream/web";
import {
	Awaitable,
	Timers,
	base64Decode,
	base64Encode,
	defaultTimers,
} from "../shared";
import {
	InclusiveRange,
	MultipartOptions,
	MultipartReadableStream,
} from "./blob";
import { TypedDatabase } from "./sql";
import { Storage } from "./storage";

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

interface Row {
	key: string;
	blob_id: string;
	expiration: number | null; // milliseconds since unix epoch
	metadata: string | null;
}
const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS _mf_entries (
  key TEXT PRIMARY KEY,
  blob_id TEXT NOT NULL,
  expiration INTEGER,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS _mf_entries_expiration_idx ON _mf_entries(expiration);
`;
function sqlStmts(db: TypedDatabase) {
	const stmtGetBlobIdByKey = db.prepare<Pick<Row, "key">, Pick<Row, "blob_id">>(
		"SELECT blob_id FROM _mf_entries WHERE key = :key"
	);
	const stmtPut = db.prepare<Row>(
		`INSERT OR REPLACE INTO _mf_entries (key, blob_id, expiration, metadata)
    VALUES (:key, :blob_id, :expiration, :metadata)`
	);

	return {
		getByKey: db.prepare<Pick<Row, "key">, Row>(
			"SELECT key, blob_id, expiration, metadata FROM _mf_entries WHERE key = :key"
		),
		put: db.transaction((newEntry: Row) => {
			// TODO(perf): would be really nice if we didn't have to use a transaction
			//  here, need old blob ID for cleanup
			const key = newEntry.key;
			const entry = stmtGetBlobIdByKey.get({ key });
			stmtPut.run(newEntry);
			return entry?.blob_id;
		}),
		deleteByKey: db.prepare<
			Pick<Row, "key">,
			Pick<Row, "blob_id" | "expiration">
		>("DELETE FROM _mf_entries WHERE key = :key RETURNING blob_id, expiration"),
		deleteExpired: db.prepare<{ now: number }, Pick<Row, "blob_id">>(
			// `expiration` may be `NULL`, but `NULL < ...` should be falsy
			"DELETE FROM _mf_entries WHERE expiration < :now RETURNING blob_id"
		),
		list: db.prepare<
			{
				now: number;
				escaped_prefix: string;
				start_after: string;
				limit: number;
			},
			Omit<Row, "blob_id">
		>(
			`SELECT key, expiration, metadata FROM _mf_entries
        WHERE key LIKE :escaped_prefix || '%' ESCAPE '\\'
        AND key > :start_after
        AND (expiration IS NULL OR expiration >= :now)
        ORDER BY key LIMIT :limit`
		),
	};
}

function escapePrefix(prefix: string) {
	// Prefix all instances of `\`, `_` and `%` with `\`
	return prefix.replace(/[\\_%]/g, "\\$&");
}

function rowEntry<Metadata>(entry: Omit<Row, "blob_id">): KeyEntry<Metadata> {
	return {
		key: entry.key,
		expiration: entry.expiration ?? undefined,
		metadata: entry.metadata === null ? undefined : JSON.parse(entry.metadata),
	};
}

export type RangeOptionsFactory<Metadata> = (
	metadata: Metadata
) => { ranges?: InclusiveRange[] } & MultipartOptions;

export class KeyValueStorage<Metadata = unknown> {
	readonly #stmts: ReturnType<typeof sqlStmts>;

	constructor(
		private readonly storage: Storage,
		private readonly timers: Timers = defaultTimers
	) {
		storage.db.pragma("case_sensitive_like = TRUE");
		storage.db.exec(SQL_SCHEMA);
		this.#stmts = sqlStmts(storage.db);
	}

	#hasExpired(entry: Pick<Row, "expiration">) {
		return entry.expiration !== null && entry.expiration <= this.timers.now();
	}

	#backgroundDelete(blobId: string) {
		// Once rows are deleted, or if they failed to insert, we delete the
		// corresponding blobs in the background, ignoring errors. Blob IDs are
		// unguessable, so if there aren't any references to them, they can't be
		// accessed. This means if we fail to delete a blob for any reason, it
		// doesn't matter, we'll just have a dangling file taking up disk space.
		queueMicrotask(() => this.storage.blob.delete(blobId).catch(() => {}));
	}

	get(key: string): Promise<KeyValueEntry<Metadata> | null>;
	get(
		key: string,
		optsFactory?: RangeOptionsFactory<Metadata>
	): Promise<KeyMultipartValueEntry<Metadata> | null>;
	async get(
		key: string,
		optsFactory?: RangeOptionsFactory<Metadata>
	): Promise<
		KeyValueEntry<Metadata> | KeyMultipartValueEntry<Metadata> | null
	> {
		// Try to get key from metadata store, returning null if not found
		const row = this.#stmts.getByKey.get({ key });
		if (row === undefined) return null;

		if (this.#hasExpired(row)) {
			// If expired, delete from metadata and blob stores. Assuming a
			// monotonically increasing clock, this doesn't need to be in a
			// transaction with the above get. If we call `get()` again, the current
			// time will be >= now, so the entry will still be expired. Trying to
			// delete an already deleted row won't do anything, and we'll ignore the
			// blob not found error.
			this.#stmts.deleteByKey.run({ key });
			// Garbage collect expired blob
			this.#backgroundDelete(row.blob_id);
			return null;
		}

		const entry = rowEntry<Metadata>(row);
		const opts = entry.metadata && optsFactory?.(entry.metadata);
		if (opts?.ranges === undefined || opts.ranges.length <= 1) {
			// If no range was requested, or just a single one was, return a regular
			// stream
			const value = await this.storage.blob.get(row.blob_id, opts?.ranges?.[0]);
			if (value === null) return null;
			return { ...entry, value };
		} else {
			// Otherwise, if multiple ranges were requested, return a multipart stream
			const value = await this.storage.blob.get(row.blob_id, opts.ranges, opts);
			if (value === null) return null;
			return { ...entry, value };
		}
	}

	async put(entry: KeyValueEntry<Awaitable<Metadata>>): Promise<void> {
		// (NOTE: `Awaitable` allows metadata to be a `Promise`, this is used by
		// the Cache gateway to include `size` in the metadata, which may only be
		// known once the stream is written to the blob store if no `Content-Length`
		// header was specified)

		// Empty keys are not permitted because we default to starting after "" when
		// listing. See `list()` for more details.
		assert.notStrictEqual(entry.key, "");
		const blobId = await this.storage.blob.put(entry.value);
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
		const row = this.#stmts.deleteByKey.get({ key });
		if (row === undefined) return false;
		// Garbage collect deleted entry's blob
		this.#backgroundDelete(row.blob_id);
		// Return true iff this entry hasn't expired
		return !this.#hasExpired(row);
	}

	async list(opts: KeyEntriesQuery): Promise<KeyEntries<Metadata>> {
		// Find non-expired entries matching query after cursor
		const now = this.timers.now();
		const rows = this.#stmts.list.all({
			now,
			escaped_prefix: escapePrefix(opts.prefix ?? ""),
			// Note the "" default here prohibits empty string keys. The consumers
			// of this class are KV and Cache. KV validates keys are non-empty.
			// Cache keys are usually URLs, but can be customised with `cf.cacheKey`.
			// If this is empty, we can just not cache the response, since that
			// satisfies the Cache API contract.
			start_after: opts.cursor === undefined ? "" : base64Decode(opts.cursor),
			// Increase the queried limit by 1, if we return this many results, we
			// know there are more rows. We'll truncate to the original limit before
			// returning results.
			limit: opts.limit + 1,
		});

		// Garbage collect expired entries. As with `get()`, assuming a
		// monotonically increasing clock, this doesn't need to be in a transaction.
		const expiredRows = this.#stmts.deleteExpired.all({ now });
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
