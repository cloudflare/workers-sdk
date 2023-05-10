import assert from "assert";
import crypto from "crypto";
import { ReadableStream, TransformStream } from "stream/web";
import {
	DeferredPromise,
	Log,
	Timers,
	WaitGroup,
	base64Decode,
	base64Encode,
	maybeApply,
	prefixError,
} from "../../shared";
import {
	BlobId,
	InclusiveRange,
	NewStorage,
	TypedDatabase,
	escapeLike,
} from "../../storage2";
import {
	BadUpload,
	EntityTooSmall,
	InternalError,
	InvalidPart,
	NoSuchKey,
	NoSuchUpload,
	PreconditionFailed,
} from "./errors";
import { R2Object, R2ObjectBody } from "./r2Object";
import {
	MultipartPartRow,
	MultipartUploadRow,
	MultipartUploadState,
	ObjectRow,
	R2Conditional,
	R2CreateMultipartUploadOptions,
	R2CreateMultipartUploadResponse,
	R2GetOptions,
	R2ListOptions,
	R2PublishedPart,
	R2PutOptions,
	R2Range,
	R2UploadPartResponse,
	SQL_SCHEMA,
} from "./schemas";
import {
	MAX_LIST_KEYS,
	R2Hashes,
	R2_HASH_ALGORITHMS,
	Validator,
} from "./validator";

// This file implements Miniflare's R2 simulator, supporting both single and
// multipart uploads.
//
// ===== Notes on Multipart Uploads =====
//
// Multipart uploads are created and later resumed. When creating a multipart
// upload, Miniflare will store an upload record, containing passed HTTP and
// custom metadata. This record serves as a marker for the upload, and is used
// by other methods to check the upload exists.
//
// A new part record is stored for each uploaded part. Each part gets an
// associated ETag, which must be used in conjunction with the part number when
// completing an upload. If a part is uploaded with the same part number as an
// existing part, it will override it.
//
// To complete a multipart upload, an array of part number and ETag objects is
// required. Miniflare will add an object record as usual, but without a body.
// The selected parts will have their records updated to point to the body.
// This means Miniflare doesn't need to load all parts into memory, concatenate
// them, and write them back out. An upload can also be aborted, in which case
// all its parts will be deleted.
//
// Note that when completing or aborting an upload, the upload record is NOT
// deleted. This is because uploads can be aborted more than once, and even
// aborted after completion (although in this case, aborting is a no-op). We
// need to be able to distinguish between a completed upload, an aborted upload
// and an upload that never existed to handle this, and match R2's error
// messages.
//
// If regular `R2Bucket#{put,delete}()` methods are called on completed
// multipart objects, they will delete all parts in addition to the object
// itself. `R2Bucket#{put,delete}()` will never delete parts for in-progress
// uploads. `R2Bucket#{head,get,list}()` will never return data from in-progress
// uploads.

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

function generateVersion() {
	return crypto.randomBytes(16).toString("hex");
}
function generateId() {
	return crypto.randomBytes(128).toString("base64url");
}
function generateMultipartEtag(md5Hexes: string[]) {
	// https://stackoverflow.com/a/19896823
	const hash = crypto.createHash("md5");
	for (const md5Hex of md5Hexes) hash.update(Buffer.from(md5Hex, "hex"));
	return `${hash.digest("hex")}-${md5Hexes.length}`;
}

function rangeOverlaps(a: InclusiveRange, b: InclusiveRange): boolean {
	return a.start <= b.end && b.start <= a.end;
}

function sqlStmts(db: TypedDatabase) {
	const stmtGetPreviousByKey = db.prepare<
		Pick<ObjectRow, "key">,
		Pick<ObjectRow, "blob_id" | "etag" | "uploaded">
	>("SELECT blob_id, etag, uploaded FROM _mf_objects WHERE key = :key");
	// Regular statements
	const stmtGetByKey = db.prepare<Pick<ObjectRow, "key">, ObjectRow>(`
    SELECT key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata
    FROM _mf_objects WHERE key = :key
  `);
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

	// Multipart upload statements
	const stmtGetUploadState = db.prepare<
		Pick<MultipartUploadRow, "upload_id" | "key">,
		Pick<MultipartUploadRow, "state">
	>(
		// For checking current upload state
		"SELECT state FROM _mf_multipart_uploads WHERE upload_id = :upload_id AND key = :key"
	);
	const stmtGetUploadMetadata = db.prepare<
		Pick<MultipartUploadRow, "upload_id" | "key">,
		Pick<MultipartUploadRow, "http_metadata" | "custom_metadata" | "state">
	>(
		// For checking current upload state, and getting metadata for completion
		"SELECT http_metadata, custom_metadata, state FROM _mf_multipart_uploads WHERE upload_id = :upload_id AND key = :key"
	);
	const stmtUpdateUploadState = db.prepare<
		Pick<MultipartUploadRow, "upload_id" | "state">
	>(
		// For completing/aborting uploads
		"UPDATE _mf_multipart_uploads SET state = :state WHERE upload_id = :upload_id"
	);
	// Multipart part statements
	const stmtGetPreviousPartByNumber = db.prepare<
		Pick<MultipartPartRow, "upload_id" | "part_number">,
		Pick<MultipartPartRow, "blob_id">
	>(
		// For getting part number's previous blob ID to garbage collect
		"SELECT blob_id FROM _mf_multipart_parts WHERE upload_id = :upload_id AND part_number = :part_number"
	);
	const stmtPutPart = db.prepare<Omit<MultipartPartRow, "object_key">>(
		// For recording metadata when uploading parts
		`INSERT OR REPLACE INTO _mf_multipart_parts (upload_id, part_number, blob_id, size, etag, checksum_md5)
    VALUES (:upload_id, :part_number, :blob_id, :size, :etag, :checksum_md5)`
	);
	const stmtLinkPart = db.prepare<
		Pick<MultipartPartRow, "upload_id" | "part_number" | "object_key">
	>(
		// For linking parts with an object when completing uploads
		`UPDATE _mf_multipart_parts SET object_key = :object_key
    WHERE upload_id = :upload_id AND part_number = :part_number`
	);
	const stmtDeletePartsByUploadId = db.prepare<
		Pick<MultipartPartRow, "upload_id">,
		Pick<MultipartPartRow, "blob_id">
	>(
		// For deleting parts when aborting uploads
		"DELETE FROM _mf_multipart_parts WHERE upload_id = :upload_id RETURNING blob_id"
	);
	const stmtDeleteUnlinkedPartsByUploadId = db.prepare<
		Pick<MultipartPartRow, "upload_id">,
		Pick<MultipartPartRow, "blob_id">
	>(
		// For deleting unused parts when completing uploads
		"DELETE FROM _mf_multipart_parts WHERE upload_id = :upload_id AND object_key IS NULL RETURNING blob_id"
	);
	const stmtDeletePartsByKey = db.prepare<
		Pick<MultipartPartRow, "object_key">,
		Pick<MultipartPartRow, "blob_id">
	>(
		// For deleting dangling parts when overwriting an existing key
		"DELETE FROM _mf_multipart_parts WHERE object_key = :object_key RETURNING blob_id"
	);
	const stmtListPartsByUploadId = db.prepare<
		Pick<MultipartPartRow, "upload_id">,
		Omit<MultipartPartRow, "blob_id">
	>(
		// For getting part metadata when completing uploads
		`SELECT upload_id, part_number, blob_id, size, etag, checksum_md5, object_key
    FROM _mf_multipart_parts WHERE upload_id = :upload_id`
	);
	const stmtListPartsByKey = db.prepare<
		Pick<MultipartPartRow, "object_key">,
		Pick<MultipartPartRow, "blob_id" | "size">
	>(
		// For getting part metadata when getting values, size included for range
		// requests, so we only need to read blobs containing the required data
		"SELECT blob_id, size FROM _mf_multipart_parts WHERE object_key = :object_key ORDER BY part_number"
	);

	return {
		getByKey: stmtGetByKey,
		getPartsByKey: db.transaction((key: string) => {
			const row = stmtGetByKey.get({ key });
			if (row === undefined) return;
			if (row.blob_id === null) {
				// If this is a multipart object, also return the parts
				const partsRows = stmtListPartsByKey.all({ object_key: key });
				return { row, parts: partsRows };
			} else {
				// Otherwise, just return the row
				return { row };
			}
		}),
		put: db.transaction((newRow: ObjectRow, onlyIf?: R2Conditional) => {
			const key = newRow.key;
			const row = stmtGetPreviousByKey.get({ key });
			if (onlyIf !== undefined) validate.condition(row, onlyIf);
			stmtPut.run(newRow);
			const maybeOldBlobId = row?.blob_id;
			if (maybeOldBlobId === undefined) {
				return [];
			} else if (maybeOldBlobId === null) {
				// If blob_id is null, this was a multipart object, so delete all
				// multipart parts
				const rows = stmtDeletePartsByKey.all({ object_key: key });
				return rows.map(({ blob_id }) => blob_id);
			} else {
				return [maybeOldBlobId];
			}
		}),
		deleteByKeys: db.transaction((keys: string[]) => {
			const oldBlobIds: string[] = [];
			for (const key of keys) {
				const row = stmtDelete.get({ key });
				const maybeOldBlobId = row?.blob_id;
				if (maybeOldBlobId === null) {
					// If blob_id is null, this was a multipart object, so delete all
					// multipart parts
					const partRows = stmtDeletePartsByKey.all({ object_key: key });
					for (const partRow of partRows) oldBlobIds.push(partRow.blob_id);
				} else if (maybeOldBlobId !== undefined) {
					oldBlobIds.push(maybeOldBlobId);
				}
			}
			return oldBlobIds;
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

		createMultipartUpload: db.prepare<Omit<MultipartUploadRow, "state">>(`
      INSERT INTO _mf_multipart_uploads (upload_id, key, http_metadata, custom_metadata)
      VALUES (:upload_id, :key, :http_metadata, :custom_metadata)
    `),
		putPart: db.transaction(
			(key: string, newRow: Omit<MultipartPartRow, "object_key">) => {
				// 1. Check the upload exists and is in-progress
				const uploadRow = stmtGetUploadState.get({
					key,
					upload_id: newRow.upload_id,
				});
				if (uploadRow?.state !== MultipartUploadState.IN_PROGRESS) {
					throw new NoSuchUpload();
				}

				// 2. Check if we have an existing part with this number, then upsert
				const partRow = stmtGetPreviousPartByNumber.get({
					upload_id: newRow.upload_id,
					part_number: newRow.part_number,
				});
				stmtPutPart.run(newRow);
				return partRow?.blob_id;
			}
		),
		completeMultipartUpload: db.transaction(
			(key: string, upload_id: string, selectedParts: R2PublishedPart[]) => {
				// 1. Check the upload exists and is in-progress
				const uploadRow = stmtGetUploadMetadata.get({ key, upload_id });
				if (uploadRow === undefined) {
					throw new InternalError();
				} else if (uploadRow.state > MultipartUploadState.IN_PROGRESS) {
					throw new NoSuchUpload();
				}

				// 2. Check all selected part numbers are unique
				const partNumberSet = new Set<number>();
				for (const { part } of selectedParts) {
					if (partNumberSet.has(part)) throw new InternalError();
					partNumberSet.add(part);
				}

				// 3. Get metadata for all uploaded parts, checking all selected parts
				//    exist
				const uploadedPartRows = stmtListPartsByUploadId.all({ upload_id });
				const uploadedParts = new Map<
					/* part number */ number,
					Omit<MultipartPartRow, "blob_id">
				>();
				for (const row of uploadedPartRows) {
					uploadedParts.set(row.part_number, row);
				}
				const parts = selectedParts.map((selectedPart) => {
					// Try find matching uploaded part. If part couldn't be found, or
					// ETags don't match, throw.
					const uploadedPart = uploadedParts.get(selectedPart.part);
					// (if an uploaded part couldn't be found with the selected part
					// number, `uploadedPart?.etag` will be `undefined`, which will never
					// match `selectedPart.etag`, as we've validated it's a string)
					if (uploadedPart?.etag !== selectedPart.etag) {
						throw new InvalidPart();
					}
					return uploadedPart;
				});
				// `parts` now contains a list of selected parts' metadata.

				// 4. Check all but last part meets minimum size requirements. First
				//    check this in argument order, throwing a friendly error...
				for (const part of parts.slice(0, -1)) {
					if (part.size < R2Gateway._MIN_MULTIPART_PART_SIZE) {
						throw new EntityTooSmall();
					}
				}
				//    ...then check again in ascending part number order, throwing an
				//    internal error. We won't know where the current last element ends
				//    up in the sort, so we just check all parts again.
				//
				//    Also check that all but the last parts are the same size...
				parts.sort((a, b) => a.part_number - b.part_number);
				let partSize: number | undefined;
				for (const part of parts.slice(0, -1)) {
					partSize ??= part.size;
					if (
						part.size < R2Gateway._MIN_MULTIPART_PART_SIZE ||
						part.size !== partSize
					) {
						throw new BadUpload();
					}
				}
				//    ...and the last part is not greater than all others
				//    (if part size is defined, we must have at least one part)
				if (partSize !== undefined && parts[parts.length - 1].size > partSize) {
					throw new BadUpload();
				}

				// 5. Get existing upload if any, and delete previous multipart parts
				const oldBlobIds: string[] = [];
				const existingRow = stmtGetPreviousByKey.get({ key });
				const maybeOldBlobId = existingRow?.blob_id;
				if (maybeOldBlobId === null) {
					// If blob_id is null, this was a multipart object, so delete all
					// multipart parts
					const partRows = stmtDeletePartsByKey.all({ object_key: key });
					for (const partRow of partRows) oldBlobIds.push(partRow.blob_id);
				} else if (maybeOldBlobId !== undefined) {
					oldBlobIds.push(maybeOldBlobId);
				}

				// 6. Write object to the database, and link parts with object
				const totalSize = parts.reduce((acc, { size }) => acc + size, 0);
				const etag = generateMultipartEtag(
					parts.map(({ checksum_md5 }) => checksum_md5)
				);
				const newRow: ObjectRow = {
					key,
					blob_id: null,
					version: generateVersion(),
					size: totalSize,
					etag,
					uploaded: Date.now(),
					checksums: "{}",
					http_metadata: uploadRow.http_metadata,
					custom_metadata: uploadRow.custom_metadata,
				};
				stmtPut.run(newRow);
				for (const part of parts) {
					stmtLinkPart.run({
						upload_id,
						part_number: part.part_number,
						object_key: key,
					});
				}

				// 7. Delete unlinked, unused parts
				const partRows = stmtDeleteUnlinkedPartsByUploadId.all({ upload_id });
				for (const partRow of partRows) oldBlobIds.push(partRow.blob_id);

				// 8. Mark the upload as completed
				stmtUpdateUploadState.run({
					upload_id,
					state: MultipartUploadState.COMPLETED,
				});

				return { newRow, oldBlobIds };
			}
		),
		abortMultipartUpload: db.transaction((key: string, upload_id: string) => {
			// 1. Make sure this multipart upload exists, ignoring finalised states
			const uploadRow = stmtGetUploadState.get({ key, upload_id });
			if (uploadRow === undefined) {
				throw new InternalError();
			} else if (uploadRow.state > MultipartUploadState.IN_PROGRESS) {
				// If this upload has already been finalised, return here. `abort()` can
				// be called multiple times, and on already `complete()`ed uploads. In
				// the later case, we really don't want to delete pointed-to parts.
				return [];
			}

			// 2. Delete all parts in the upload
			const partRows = stmtDeletePartsByUploadId.all({ upload_id });
			const oldBlobIds = partRows.map(({ blob_id }) => blob_id);

			// 3. Mark the uploaded as aborted
			stmtUpdateUploadState.run({
				upload_id,
				state: MultipartUploadState.ABORTED,
			});

			return oldBlobIds;
		}),
	};
}

export class R2Gateway {
	// Minimum multipart part upload size is configurable, so we can use smaller
	// values in tests
	/** @internal */
	static _MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024;

	readonly #storage: NewStorage;
	readonly #stmts: ReturnType<typeof sqlStmts>;

	// Multipart uploads are stored as multiple blobs. Therefore, when reading a
	// multipart upload, we'll be reading multiple blobs. When an object is
	// deleted, all its blobs are deleted in the background.
	//
	// Normally for single part objects, this is fine, since we'd open a handle to
	// a single blob, which we'd have until we closed it, at which point the blob
	// may be deleted. With multipart, we don't want to open handles for all blobs
	// as we could hit open file descriptor limits. Similarly, we don't want to
	// read all blobs first, as we'd have to buffer them.
	//
	// Instead, we set up in-process locking on blobs needed for multipart reads.
	// When we start a multipart read, we acquire all the blobs we need, then
	// release them as we've streamed each part. Multiple multipart reads may be
	// in-progress at any given time, so we use a wait group.
	//
	// This assumes we only ever have a single Miniflare instance operating on a
	// blob store, which is always true for in-memory stores, and usually true for
	// on-disk ones. If we really wanted to do this properly, we could store the
	// bookkeeping for the wait group in SQLite, but then we'd have to implement
	// some inter-process signalling/subscription system.
	readonly #inUseBlobs = new Map<BlobId, WaitGroup>();

	constructor(
		private readonly log: Log,
		storage: NewStorage,
		private readonly timers: Timers
	) {
		this.#storage = storage;
		this.#storage.db.pragma("case_sensitive_like = TRUE");
		this.#storage.db.exec(SQL_SCHEMA);
		this.#stmts = sqlStmts(this.#storage.db);
	}

	#acquireBlob(blobId: BlobId) {
		let waitGroup = this.#inUseBlobs.get(blobId);
		if (waitGroup === undefined) {
			waitGroup = new WaitGroup();
			this.#inUseBlobs.set(blobId, waitGroup);
			waitGroup.add();
			// Automatically remove the wait group once this blob is fully released
			waitGroup.wait().then(() => this.#inUseBlobs.delete(blobId));
		} else {
			waitGroup.add();
		}
	}

	#releaseBlob(blobId: BlobId) {
		this.#inUseBlobs.get(blobId)?.done();
	}

	#backgroundDelete(blobId: BlobId) {
		this.timers.queueMicrotask(async () => {
			// Wait for all multipart gets using this blob to complete
			await this.#inUseBlobs.get(blobId)?.wait();
			return this.#storage.blob.delete(blobId).catch((e) => {
				this.log.error(prefixError("Deleting Blob", e));
			});
		});
	}

	#assembleMultipartValue(
		storage: NewStorage,
		parts: Pick<MultipartPartRow, "blob_id" | "size">[],
		queryRange: InclusiveRange
	): ReadableStream<Uint8Array> {
		// Find required parts (and the ranges within them) to satisfy the query
		// (doing this outside async IIFE to acquire all required parts before we
		// start streaming any)
		const requiredParts: { blobId: BlobId; range: InclusiveRange }[] = [];
		let start = 0;
		for (const part of parts) {
			const partRange: InclusiveRange = { start, end: start + part.size - 1 };
			if (rangeOverlaps(partRange, queryRange)) {
				const range: InclusiveRange = {
					start: Math.max(partRange.start, queryRange.start) - partRange.start,
					end: Math.min(partRange.end, queryRange.end) - partRange.start,
				};
				this.#acquireBlob(part.blob_id);
				requiredParts.push({ blobId: part.blob_id, range });
			}
			start = partRange.end + 1;
		}

		// Stream required parts, the `Promise`s returned from `pipeTo()` won't
		// resolve until a reader starts reading, so run this in the background as
		// an async IIFE.
		const identity = new TransformStream<Uint8Array, Uint8Array>();
		(async () => {
			let i = 0;
			try {
				// Sharing loop index with `finally` block to ensure all blobs released.
				// `i++` is only called at the *end* of a loop iteration, just after we
				// release a blob. If an iteration throws, `i` will remain the same, and
				// that blob (and the rest) will be released in the `finally`.
				for (; i < requiredParts.length; i++) {
					const { blobId, range } = requiredParts[i];
					const value = await storage.blob.get(blobId, range);
					const msg = `Expected to find blob "${blobId}" for multipart value`;
					assert(value !== null, msg);
					await value.pipeTo(identity.writable, { preventClose: true });
					this.#releaseBlob(blobId);
				}
				await identity.writable.close();
			} catch (e) {
				identity.writable.abort(e);
			} finally {
				for (; i < requiredParts.length; i++) {
					this.#releaseBlob(requiredParts[i].blobId);
				}
			}
		})();
		return identity.readable;
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

		// Try to get this key, including multipart parts if it's multipart
		const result = this.#stmts.getPartsByKey(key);
		if (result === undefined) throw new NoSuchKey();
		const { row, parts } = result;

		// Validate pre-condition
		const defaultR2Range: R2Range = { offset: 0, length: row.size };
		try {
			validate.condition(row, options.onlyIf);
		} catch (e) {
			if (e instanceof PreconditionFailed) {
				e.attach(new R2Object(row, defaultR2Range));
			}
			throw e;
		}

		// Validate range, and convert to R2 range for return
		const range = validate.range(options, row.size);
		let r2Range: R2Range;
		if (range === undefined) {
			r2Range = defaultR2Range;
		} else {
			const start = range.start;
			const end = Math.min(range.end, row.size);
			r2Range = { offset: start, length: end - start + 1 };
		}

		let value: ReadableStream<Uint8Array> | null;
		if (row.blob_id === null) {
			// If this is a multipart object, we should've fetched multipart parts
			assert(parts !== undefined);
			const defaultRange = { start: 0, end: row.size - 1 };
			value = this.#assembleMultipartValue(
				this.#storage,
				parts,
				range ?? defaultRange
			);
		} else {
			// Otherwise, just return a single part value
			value = await this.#storage.blob.get(row.blob_id, range);
			if (value === null) throw new NoSuchKey();
		}

		return new R2ObjectBody(row, value, r2Range);
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
		const row: ObjectRow = {
			key,
			blob_id: blobId,
			version: generateVersion(),
			size: valueSize,
			etag: md5DigestHex,
			uploaded: Date.now(),
			checksums: JSON.stringify(checksums),
			http_metadata: JSON.stringify(options.httpMetadata ?? {}),
			custom_metadata: JSON.stringify(options.customMetadata ?? {}),
		};
		let oldBlobIds: string[] | undefined;
		try {
			oldBlobIds = this.#stmts.put(row, options.onlyIf);
		} catch (e) {
			// Probably precondition failed. In any case, the put transaction failed,
			// so we're not storing a reference to the blob ID
			this.#backgroundDelete(blobId);
			throw e;
		}
		if (oldBlobIds !== undefined) {
			for (const blobId of oldBlobIds) this.#backgroundDelete(blobId);
		}
		return new R2Object(row);
	}

	async delete(keys: string | string[]) {
		if (!Array.isArray(keys)) keys = [keys];
		for (const key of keys) validate.key(key);
		const oldBlobIds = this.#stmts.deleteByKeys(keys);
		for (const blobId of oldBlobIds) this.#backgroundDelete(blobId);
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

	async createMultipartUpload(
		key: string,
		opts: R2CreateMultipartUploadOptions
	): Promise<R2CreateMultipartUploadResponse> {
		validate.key(key);

		const uploadId = generateId();
		this.#stmts.createMultipartUpload.run({
			key,
			upload_id: uploadId,
			http_metadata: JSON.stringify(opts.httpMetadata ?? {}),
			custom_metadata: JSON.stringify(opts.customMetadata ?? {}),
		});
		return { uploadId };
	}

	async uploadPart(
		key: string,
		uploadId: string,
		partNumber: number,
		value: ReadableStream<Uint8Array>,
		valueSize: number
	): Promise<R2UploadPartResponse> {
		validate.key(key);

		// Store value in the blob store, computing MD5 digest as we go
		const digesting = new DigestingStream(["md5"]);
		const blobId = await this.#storage.blob.put(value.pipeThrough(digesting));
		const digests = await digesting.digests;
		const md5Digest = digests.get("md5");
		assert(md5Digest !== undefined);

		// Generate random ETag for this part
		const etag = generateId();

		// Store the new part in the metadata store, removing the old blob
		// associated with this part number if any
		let maybeOldBlobId: string | undefined;
		try {
			maybeOldBlobId = this.#stmts.putPart(key, {
				upload_id: uploadId,
				part_number: partNumber,
				blob_id: blobId,
				size: valueSize,
				etag,
				checksum_md5: md5Digest.toString("hex"),
			});
		} catch (e) {
			// Probably upload not found. In any case, the put transaction failed,
			// so we're not storing a reference to the blob ID
			this.#backgroundDelete(blobId);
			throw e;
		}
		if (maybeOldBlobId !== undefined) this.#backgroundDelete(maybeOldBlobId);

		return { etag };
	}

	async completeMultipartUpload(
		key: string,
		uploadId: string,
		parts: R2PublishedPart[]
	): Promise<R2Object> {
		validate.key(key);
		const { newRow, oldBlobIds } = this.#stmts.completeMultipartUpload(
			key,
			uploadId,
			parts
		);
		for (const blobId of oldBlobIds) this.#backgroundDelete(blobId);
		return new R2Object(newRow);
	}

	async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
		validate.key(key);
		const oldBlobIds = this.#stmts.abortMultipartUpload(key, uploadId);
		for (const blobId of oldBlobIds) this.#backgroundDelete(blobId);
	}
}
