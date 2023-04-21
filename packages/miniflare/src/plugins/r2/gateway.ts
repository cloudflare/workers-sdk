import assert from "assert";
import crypto from "crypto";
import { ReadableStream, TransformStream } from "stream/web";
import {
	DeferredPromise,
	Log,
	base64Decode,
	base64Encode,
	maybeApply,
} from "../../shared";
import { Storage } from "../../storage";
import { NewStorage, TypedDatabase, escapeLike } from "../../storage2";
import { NoSuchKey } from "./errors";
import { R2Object, R2ObjectBody } from "./r2Object";
import {
	ObjectRow,
	R2Conditional,
	R2GetOptions,
	R2ListOptions,
	R2PutOptions,
	R2Range,
	SQL_SCHEMA,
} from "./schemas";
import {
	MAX_LIST_KEYS,
	R2Hashes,
	R2_HASH_ALGORITHMS,
	Validator,
} from "./validator";

class DigestingStream<
	Algorithm extends string = string,
> extends TransformStream<Uint8Array, Uint8Array> {
	readonly digests: Promise<Map<Algorithm, Buffer>>;

	constructor(algorithms: Algorithm[]) {
		const digests = new DeferredPromise<Map<Algorithm, Buffer>>();
		const hashes = algorithms.map((alg) => crypto.createHash(alg));
		super({
			transform(chunk, controller) {
				for (const hash of hashes) hash.update(chunk);
				controller.enqueue(chunk);
			},
			flush() {
				const result = new Map<Algorithm, Buffer>();
				for (let i = 0; i < hashes.length; i++) {
					result.set(algorithms[i], hashes[i].digest());
				}
				digests.resolve(result);
			},
		});
		this.digests = digests;
	}
}

export interface R2Objects {
	// An array of objects matching the list request.
	objects: R2Object[];
	// If true, indicates there are more results to be retrieved for the current
	// list request.
	truncated: boolean;
	// A token that can be passed to future list calls to resume listing from that
	// point.
	// Only present if truncated is true.
	cursor?: string;
	// If a delimiter has been specified, contains all prefixes between the
	// specified prefix and the next occurrence of the delimiter. For example, if
	// no prefix is provided and the delimiter is "/", "foo/bar/baz" would return
	// "foo" as a delimited prefix. If "foo/" was passed as a prefix with the same
	// structure and delimiter, "foo/bar" would be returned as a delimited prefix.
	delimitedPrefixes: string[];
}

const validate = new Validator();

function sqlStmts(db: TypedDatabase) {
	const stmtGetPreviousByKey = db.prepare<
		Pick<ObjectRow, "key">,
		Pick<ObjectRow, "blob_id" | "etag" | "uploaded">
	>("SELECT blob_id, etag, uploaded FROM _mf_objects WHERE key = :key");
	const stmtPut = db.prepare<ObjectRow>(`
    INSERT OR REPLACE INTO _mf_objects (key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata)
    VALUES (:key, :blob_id, :version, :size, :etag, :uploaded, :checksums, :http_metadata, :custom_metadata)
  `);
	const stmtDelete = db.prepare<
		Pick<ObjectRow, "key">,
		Pick<ObjectRow, "blob_id">
	>("DELETE FROM _mf_objects WHERE key = :key RETURNING blob_id");

	function stmtListWithoutDelimiter<ExtraColumns extends (keyof ObjectRow)[]>(
		...extraColumns: ExtraColumns
	) {
		const columns: (keyof ObjectRow)[] = [
			"key",
			"version",
			"size",
			"etag",
			"uploaded",
			"checksums",
			...extraColumns,
		];
		// TODO: consider applying same `:start_after IS NULL` trick to KeyValueStore
		return db.prepare<
			{ limit: number; escaped_prefix: string; start_after: string | null },
			Omit<ObjectRow, "blob_id"> & Pick<ObjectRow, ExtraColumns[number]>
		>(`
      SELECT ${columns.join(", ")}
      FROM _mf_objects
      WHERE key LIKE :escaped_prefix || '%' ESCAPE '\\'
      AND (:start_after IS NULL OR key > :start_after)
      ORDER BY key LIMIT :limit
    `);
	}

	return {
		getByKey: db.prepare<Pick<ObjectRow, "key">, ObjectRow>(`
      SELECT key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata
      FROM _mf_objects WHERE key = :key
    `),
		put: db.transaction((newRow: ObjectRow, onlyIf?: R2Conditional) => {
			const key = newRow.key;
			const row = stmtGetPreviousByKey.get({ key });
			if (onlyIf !== undefined) validate.condition(row, onlyIf);
			stmtPut.run(newRow);
			// TODO(soon): if this is null, we'll need to delete multipart parts
			return row?.blob_id ?? undefined;
		}),
		deleteByKeys: db.transaction((keys: string[]) => {
			const blobIds: string[] = [];
			for (const key of keys) {
				const row = stmtDelete.get({ key });
				// TODO(soon): if this is null, we'll need to delete multipart parts
				if (row?.blob_id != null) blobIds.push(row.blob_id);
			}
			return blobIds;
		}),
		listWithoutDelimiter: stmtListWithoutDelimiter(),
		listHttpMetadataWithoutDelimiter: stmtListWithoutDelimiter("http_metadata"),
		listCustomMetadataWithoutDelimiter:
			stmtListWithoutDelimiter("custom_metadata"),
		listHttpCustomMetadataWithoutDelimiter: stmtListWithoutDelimiter(
			"http_metadata",
			"custom_metadata"
		),
		listMetadata: db.prepare<
			{
				limit: number;
				escaped_prefix: string;
				start_after: string | null;
				prefix: string;
				delimiter: string;
			},
			Omit<ObjectRow, "key" | "blob_id"> & {
				last_key: string;
				delimited_prefix_or_key: `dlp:${string}` | `key:${string}`;
			}
		>(`
      SELECT
        -- When grouping by a delimited prefix, this will give us the last key with that prefix.
        --   NOTE: we'll use this for the next cursor. If we didn't return the last key, the next page may return the
        --   same delimited prefix. Essentially, we're skipping over all keys with this group's delimited prefix.
        -- When grouping by a key, this will just give us the key.
        max(key) AS last_key,
        iif(
            -- Try get 1-indexed position \`i\` of :delimiter in rest of key after :prefix...
                                                       instr(substr(key, length(:prefix) + 1), :delimiter),
            -- ...if found, we have a delimited prefix of the :prefix followed by the rest of key up to and including the :delimiter
            'dlp:' || substr(key, 1, length(:prefix) + instr(substr(key, length(:prefix) + 1), :delimiter) + length(:delimiter) - 1),
            -- ...otherwise, we just have a regular key
            'key:' || key
        ) AS delimited_prefix_or_key,
        -- NOTE: we'll ignore metadata for delimited prefix rows, so it doesn't matter which keys' we return
        version, size, etag, uploaded, checksums, http_metadata, custom_metadata
      FROM _mf_objects
      WHERE key LIKE :escaped_prefix || '%' ESCAPE '\\'
      AND (:start_after IS NULL OR key > :start_after)
      GROUP BY delimited_prefix_or_key -- Group keys with same delimited prefix into a row, leaving otherS in their own rows
      ORDER BY last_key LIMIT :limit;
    `),
	};
}

export class R2Gateway {
	readonly #storage: NewStorage;
	readonly #stmts: ReturnType<typeof sqlStmts>;

	constructor(
		private readonly log: Log,
		legacyStorage: Storage
	) {
		this.#storage = legacyStorage.getNewStorage();
		this.#storage.db.pragma("case_sensitive_like = TRUE");
		this.#storage.db.exec(SQL_SCHEMA);
		this.#stmts = sqlStmts(this.#storage.db);
	}

	#backgroundDelete(blobId: string) {
		void this.#storage.blob.delete(blobId).catch(() => {});
	}

	async head(key: string): Promise<R2Object> {
		validate.key(key);

		const row = this.#stmts.getByKey.get({ key });
		if (row === undefined) throw new NoSuchKey();

		const range: R2Range = { offset: 0, length: row.size };
		return new R2Object(row, range);
	}

	async get(
		key: string,
		options: R2GetOptions = {}
	): Promise<R2ObjectBody | R2Object> {
		validate.key(key);

		// TODO(soon): we may need to make this a transaction for multipart get
		const row = this.#stmts.getByKey.get({ key });
		if (row === undefined) throw new NoSuchKey();

		const defaultRange: R2Range = { offset: 0, length: row.size };
		const meta = new R2Object(row, defaultRange);
		const range = validate
			.condition(meta, options.onlyIf)
			.range(options, row.size);

		assert(row.blob_id !== null); // TODO(soon): add multipart support
		const value = await this.#storage.blob.get(row.blob_id, range);
		if (value === null) throw new NoSuchKey();

		let valueRange: R2Range | undefined;
		if (value.range !== undefined) {
			assert(!Array.isArray(value.range));
			const { start, end } = value.range;
			valueRange = { offset: start, length: end - start + 1 };
		} else {
			valueRange = defaultRange;
		}

		// TODO(now): could we reuse `meta` `R2Object` from above?
		return new R2ObjectBody(row, value, valueRange);
	}

	async put(
		key: string,
		value: ReadableStream<Uint8Array>,
		valueSize: number,
		options: R2PutOptions
	): Promise<R2Object> {
		// Store value in the blob store, computing required digests as we go
		// (this means we don't have to buffer the entire stream to compute them)
		const algorithms: (keyof R2Hashes)[] = [];
		for (const { field } of R2_HASH_ALGORITHMS) {
			// Always compute MD5 digest
			if (field === "md5" || field in options) algorithms.push(field);
		}
		const digesting = new DigestingStream(algorithms);
		const blobId = await this.#storage.blob.put(value.pipeThrough(digesting));
		const digests = await digesting.digests;
		const md5Digest = digests.get("md5");
		assert(md5Digest !== undefined);
		const md5DigestHex = md5Digest.toString("hex");

		const checksums = validate
			.key(key)
			.size(valueSize)
			.metadataSize(options.customMetadata)
			.hash(digests, options);
		const version = crypto.randomBytes(16).toString("hex");
		const row: ObjectRow = {
			key,
			blob_id: blobId,
			version,
			size: valueSize,
			etag: md5DigestHex,
			uploaded: Date.now(),
			checksums: JSON.stringify(checksums),
			http_metadata: JSON.stringify(options.httpMetadata ?? {}),
			custom_metadata: JSON.stringify(options.customMetadata ?? {}),
		};
		let maybeOldBlobId: string | undefined;
		try {
			maybeOldBlobId = this.#stmts.put(row, options.onlyIf);
		} catch (e) {
			// Probably precondition failed. In any case, the put transaction failed,
			// so we're not storing a reference to the blob ID
			this.#backgroundDelete(blobId);
			throw e;
		}
		if (maybeOldBlobId !== undefined) this.#backgroundDelete(maybeOldBlobId);
		return new R2Object(row); // TODO: do we need to specify a range here?
	}

	async delete(keys: string | string[]) {
		if (!Array.isArray(keys)) keys = [keys];
		for (const key of keys) validate.key(key);
		const blobIds = this.#stmts.deleteByKeys(keys);
		for (const blobId of blobIds) this.#backgroundDelete(blobId);
	}

	#listWithoutDelimiterQuery(excludeHttp: boolean, excludeCustom: boolean) {
		if (excludeHttp && excludeCustom) return this.#stmts.listWithoutDelimiter;
		if (excludeHttp) return this.#stmts.listCustomMetadataWithoutDelimiter;
		if (excludeCustom) return this.#stmts.listHttpMetadataWithoutDelimiter;
		return this.#stmts.listHttpCustomMetadataWithoutDelimiter;
	}

	async list(opts: R2ListOptions = {}): Promise<R2Objects> {
		const prefix = opts.prefix ?? "";

		let limit = opts.limit ?? MAX_LIST_KEYS;
		validate.limit(limit);

		// If metadata is requested, R2 may return fewer than `limit` results to
		// accommodate it. Simulate this by limiting the limit to 100.
		// See https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#r2listoptions.
		const include = opts.include ?? [];
		if (include.length > 0) limit = Math.min(limit, 100);
		const excludeHttp = !include.includes("httpMetadata");
		const excludeCustom = !include.includes("customMetadata");
		const rowObject = (
			row: Omit<ObjectRow, "blob_id" | "http_metadata" | "custom_metadata"> & {
				http_metadata?: string;
				custom_metadata?: string;
			}
		) => {
			if (row.http_metadata === undefined || excludeHttp) {
				row.http_metadata = "{}";
			}
			if (row.custom_metadata === undefined || excludeCustom) {
				row.custom_metadata = "{}";
			}
			return new R2Object(row as Omit<ObjectRow, "blob_id">);
		};

		// If cursor set, and lexicographically after `startAfter`, use that for
		// `startAfter` instead
		let startAfter = opts.startAfter;
		if (opts.cursor !== undefined) {
			const cursorStartAfter = base64Decode(opts.cursor);
			if (startAfter === undefined || cursorStartAfter > startAfter) {
				startAfter = cursorStartAfter;
			}
		}

		let delimiter = opts.delimiter;
		if (delimiter === "") delimiter = undefined;

		// Run appropriate query depending on options
		const params = {
			escaped_prefix: escapeLike(prefix),
			start_after: startAfter ?? null,
			// Increase the queried limit by 1, if we return this many results, we
			// know there are more rows. We'll truncate to the original limit before
			// returning results.
			limit: limit + 1,
		};

		let objects: R2Object[];
		const delimitedPrefixes: string[] = [];
		let nextCursorStartAfter: string | undefined;

		if (delimiter !== undefined) {
			const rows = this.#stmts.listMetadata.all({
				...params,
				prefix,
				delimiter,
			});

			// If there are more results, we'll be returning a cursor
			const hasMoreRows = rows.length === limit + 1;
			rows.splice(limit, 1);

			objects = [];
			for (const row of rows) {
				if (row.delimited_prefix_or_key.startsWith("dlp:")) {
					delimitedPrefixes.push(row.delimited_prefix_or_key.substring(4));
				} else {
					objects.push(rowObject({ ...row, key: row.last_key }));
				}
			}

			if (hasMoreRows) nextCursorStartAfter = rows[limit - 1].last_key;
		} else {
			// If we don't have a delimiter, we can use a more efficient query
			const query = this.#listWithoutDelimiterQuery(excludeHttp, excludeCustom);
			const rows = query.all(params);

			// If there are more results, we'll be returning a cursor
			const hasMoreRows = rows.length === limit + 1;
			rows.splice(limit, 1);

			objects = rows.map(rowObject);

			if (hasMoreRows) nextCursorStartAfter = rows[limit - 1].key;
		}

		// The cursor encodes a key to start after rather than the key to start at
		// to ensure keys added between `list()` calls are returned.
		const nextCursor = maybeApply(base64Encode, nextCursorStartAfter);

		return {
			objects,
			truncated: nextCursor !== undefined,
			cursor: nextCursor,
			delimitedPrefixes,
		};
	}
}
