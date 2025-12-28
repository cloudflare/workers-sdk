import assert from "node:assert";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
	all,
	base64Decode,
	base64Encode,
	BlobId,
	DeferredPromise,
	GET,
	get,
	InclusiveRange,
	maybeApply,
	MiniflareDurableObject,
	MiniflareDurableObjectEnv,
	PUT,
	readPrefix,
	RouteHandler,
	TypedSql,
	WaitGroup,
} from "miniflare:shared";
import { R2Headers, R2Limits } from "./constants";
import {
	BadUpload,
	EntityTooSmall,
	InternalError,
	InvalidMetadata,
	InvalidPart,
	NoSuchKey,
	NoSuchUpload,
	PreconditionFailed,
} from "./errors.worker";
import {
	EncodedMetadata,
	InternalR2Object,
	InternalR2ObjectBody,
	InternalR2Objects,
} from "./r2Object.worker";
import {
	InternalR2CreateMultipartUploadOptions,
	InternalR2GetOptions,
	InternalR2ListMultipartUploadsOptions,
	InternalR2ListOptions,
	InternalR2ListPartsOptions,
	InternalR2PutOptions,
	MultipartPartRow,
	MultipartUploadRow,
	MultipartUploadState,
	ObjectRow,
	R2BindingRequestSchema,
	R2Conditional,
	R2CreateMultipartUploadResponse,
	R2ListMultipartUploadsResponse,
	R2ListPartsResponse,
	R2PublishedPart,
	R2UploadPartResponse,
	SQL_SCHEMA,
} from "./schemas.worker";
import {
	DigestAlgorithm,
	R2_HASH_ALGORITHMS,
	Validator,
} from "./validator.worker";

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
	Algorithm extends DigestAlgorithm = DigestAlgorithm,
> extends TransformStream<Uint8Array, Uint8Array> {
	readonly digests: Promise<Map<Algorithm, Buffer>>;

	constructor(algorithms: Algorithm[]) {
		const digests = new DeferredPromise<Map<Algorithm, Buffer>>();
		const hashes = algorithms.map((alg) => {
			const stream = new crypto.DigestStream(alg);
			const writer = stream.getWriter();
			return { stream, writer };
		});
		super({
			async transform(chunk, controller) {
				for (const hash of hashes) await hash.writer.write(chunk);
				controller.enqueue(chunk);
			},
			async flush() {
				const result = new Map<Algorithm, Buffer>();
				for (let i = 0; i < hashes.length; i++) {
					await hashes[i].writer.close();
					result.set(algorithms[i], Buffer.from(await hashes[i].stream.digest));
				}
				digests.resolve(result);
			},
		});
		this.digests = digests;
	}
}

const validate = new Validator();
const decoder = new TextDecoder();

function generateVersion() {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
		"hex"
	);
}
function generateId() {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(128))).toString(
		"base64url"
	);
}
function generateMultipartEtag(md5Hexes: string[]) {
	// https://stackoverflow.com/a/19896823
	const hash = createHash("md5");
	for (const md5Hex of md5Hexes) hash.update(md5Hex, "hex");
	return `${hash.digest("hex")}-${md5Hexes.length}`;
}

function rangeOverlaps(a: InclusiveRange, b: InclusiveRange): boolean {
	return a.start <= b.end && b.start <= a.end;
}

async function decodeMetadata(req: Request<unknown, unknown>) {
	// Safety of `!`: `parseInt(null)` is `NaN`
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const metadataSize = parseInt(req.headers.get(R2Headers.METADATA_SIZE)!);
	if (Number.isNaN(metadataSize)) throw new InvalidMetadata();

	assert(req.body !== null);
	const body = req.body as ReadableStream<Uint8Array>;

	// Read just metadata from body stream
	const [metadataBuffer, value] = await readPrefix(body, metadataSize);
	const metadataJson = decoder.decode(metadataBuffer);
	const metadata = R2BindingRequestSchema.parse(JSON.parse(metadataJson));

	return { metadata, metadataSize, value };
}
function decodeHeaderMetadata(req: Request<unknown, unknown>) {
	const header = req.headers.get(R2Headers.REQUEST);
	if (header === null) throw new InvalidMetadata();
	return R2BindingRequestSchema.parse(JSON.parse(header));
}

function encodeResult(
	result: InternalR2Object | InternalR2ObjectBody | InternalR2Objects
) {
	let encoded: EncodedMetadata;
	if (result instanceof InternalR2Object) {
		encoded = result.encode();
	} else {
		encoded = InternalR2Object.encodeMultiple(result);
	}

	return new Response(encoded.value, {
		headers: {
			[R2Headers.METADATA_SIZE]: `${encoded.metadataSize}`,
			"Content-Type": "application/json",
			"Content-Length": `${encoded.size}`,
		},
	});
}
function encodeJSONResult(result: unknown) {
	const encoded = JSON.stringify(result);
	return new Response(encoded, {
		headers: {
			[R2Headers.METADATA_SIZE]: `${Buffer.byteLength(encoded)}`,
			"Content-Type": "application/json",
		},
	});
}

function sqlStmts(db: TypedSql) {
	const stmtGetPreviousByKey = db.stmt<
		Pick<ObjectRow, "key">,
		Pick<ObjectRow, "blob_id" | "etag" | "uploaded">
	>("SELECT blob_id, etag, uploaded FROM _mf_objects WHERE key = :key");
	// Regular statements
	const stmtGetByKey = db.stmt<Pick<ObjectRow, "key">, ObjectRow>(`
    SELECT key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata
    FROM _mf_objects WHERE key = :key
  `);
	const stmtPut = db.stmt<ObjectRow>(`
    INSERT OR REPLACE INTO _mf_objects (key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata)
    VALUES (:key, :blob_id, :version, :size, :etag, :uploaded, :checksums, :http_metadata, :custom_metadata)
  `);
	const stmtDelete = db.stmt<
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
		return db.stmt<
			{ limit: number; prefix: string; start_after: string | null },
			Omit<ObjectRow, "blob_id"> & Pick<ObjectRow, ExtraColumns[number]>
		>(`
      SELECT ${columns.join(", ")}
      FROM _mf_objects
      WHERE substr(key, 1, length(:prefix)) = :prefix
      AND (:start_after IS NULL OR key > :start_after)
      ORDER BY key LIMIT :limit
    `);
	}

	// Multipart upload statements
	const stmtGetUploadState = db.stmt<
		Pick<MultipartUploadRow, "upload_id" | "key">,
		Pick<MultipartUploadRow, "state">
	>(
		// For checking current upload state
		"SELECT state FROM _mf_multipart_uploads WHERE upload_id = :upload_id AND key = :key"
	);
	const stmtGetUploadMetadata = db.stmt<
		Pick<MultipartUploadRow, "upload_id" | "key">,
		Pick<MultipartUploadRow, "http_metadata" | "custom_metadata" | "state">
	>(
		// For checking current upload state, and getting metadata for completion
		"SELECT http_metadata, custom_metadata, state FROM _mf_multipart_uploads WHERE upload_id = :upload_id AND key = :key"
	);
	const stmtUpdateUploadState = db.stmt<
		Pick<MultipartUploadRow, "upload_id" | "state">
	>(
		// For completing/aborting uploads
		"UPDATE _mf_multipart_uploads SET state = :state WHERE upload_id = :upload_id"
	);
	// Multipart part statements
	const stmtGetPreviousPartByNumber = db.stmt<
		Pick<MultipartPartRow, "upload_id" | "part_number">,
		Pick<MultipartPartRow, "blob_id">
	>(
		// For getting part number's previous blob ID to garbage collect
		"SELECT blob_id FROM _mf_multipart_parts WHERE upload_id = :upload_id AND part_number = :part_number"
	);
	const stmtPutPart = db.stmt<Omit<MultipartPartRow, "object_key">>(
		// For recording metadata when uploading parts
		`INSERT OR REPLACE INTO _mf_multipart_parts (upload_id, part_number, blob_id, size, etag, checksum_md5, uploaded_at)
    VALUES (:upload_id, :part_number, :blob_id, :size, :etag, :checksum_md5, :uploaded_at)`
	);
	const stmtLinkPart = db.stmt<
		Pick<MultipartPartRow, "upload_id" | "part_number" | "object_key">
	>(
		// For linking parts with an object when completing uploads
		`UPDATE _mf_multipart_parts SET object_key = :object_key
    WHERE upload_id = :upload_id AND part_number = :part_number`
	);
	const stmtDeletePartsByUploadId = db.stmt<
		Pick<MultipartPartRow, "upload_id">,
		Pick<MultipartPartRow, "blob_id">
	>(
		// For deleting parts when aborting uploads
		"DELETE FROM _mf_multipart_parts WHERE upload_id = :upload_id RETURNING blob_id"
	);
	const stmtDeleteUnlinkedPartsByUploadId = db.stmt<
		Pick<MultipartPartRow, "upload_id">,
		Pick<MultipartPartRow, "blob_id">
	>(
		// For deleting unused parts when completing uploads
		"DELETE FROM _mf_multipart_parts WHERE upload_id = :upload_id AND object_key IS NULL RETURNING blob_id"
	);
	const stmtDeletePartsByKey = db.stmt<
		Pick<MultipartPartRow, "object_key">,
		Pick<MultipartPartRow, "blob_id">
	>(
		// For deleting dangling parts when overwriting an existing key
		"DELETE FROM _mf_multipart_parts WHERE object_key = :object_key RETURNING blob_id"
	);
	const stmtListPartsByUploadId = db.stmt<
		Pick<MultipartPartRow, "upload_id">,
		Omit<MultipartPartRow, "blob_id">
	>(
		// For getting part metadata when completing uploads
		`SELECT upload_id, part_number, blob_id, size, etag, checksum_md5, object_key
    FROM _mf_multipart_parts WHERE upload_id = :upload_id`
	);
	const stmtListPartsByKey = db.stmt<
		Pick<MultipartPartRow, "object_key">,
		Pick<MultipartPartRow, "blob_id" | "size">
	>(
		// For getting part metadata when getting values, size included for range
		// requests, so we only need to read blobs containing the required data
		"SELECT blob_id, size FROM _mf_multipart_parts WHERE object_key = :object_key ORDER BY part_number"
	);

	// For listParts operation with pagination
	const stmtListPartsWithPagination = db.stmt<
		{ upload_id: string; part_number_marker: number | null; limit: number },
		MultipartPartRow
	>(`
		SELECT upload_id, part_number, blob_id, size, etag, checksum_md5, object_key, uploaded_at
		FROM _mf_multipart_parts
		WHERE upload_id = :upload_id
		  AND (:part_number_marker IS NULL OR part_number > :part_number_marker)
		ORDER BY part_number
		LIMIT :limit
	`);

	// For listMultipartUploads operation with pagination
	const stmtListMultipartUploads = db.stmt<
		{ limit: number; prefix: string; start_after: string | null },
		MultipartUploadRow
	>(`
		SELECT upload_id, key, http_metadata, custom_metadata, state, initiated_at
		FROM _mf_multipart_uploads
		WHERE state = 0
		  AND substr(key, 1, length(:prefix)) = :prefix
		  AND (:start_after IS NULL OR key > :start_after)
		ORDER BY key, upload_id
		LIMIT :limit
	`);

	return {
		getByKey: stmtGetByKey,
		getPartsByKey: db.txn((key: string) => {
			const row = get(stmtGetByKey({ key }));
			if (row === undefined) return;
			if (row.blob_id === null) {
				// If this is a multipart object, also return the parts
				const partsRows = all(stmtListPartsByKey({ object_key: key }));
				return { row, parts: partsRows };
			} else {
				// Otherwise, just return the row
				return { row };
			}
		}),
		put: db.txn((newRow: ObjectRow, onlyIf?: R2Conditional) => {
			const key = newRow.key;
			const row = get(stmtGetPreviousByKey({ key }));
			if (onlyIf !== undefined) validate.condition(row, onlyIf);
			stmtPut(newRow);
			const maybeOldBlobId = row?.blob_id;
			if (maybeOldBlobId === undefined) {
				return [];
			} else if (maybeOldBlobId === null) {
				// If blob_id is null, this was a multipart object, so delete all
				// multipart parts
				const rows = all(stmtDeletePartsByKey({ object_key: key }));
				return rows.map(({ blob_id }) => blob_id);
			} else {
				return [maybeOldBlobId];
			}
		}),
		deleteByKeys: db.txn((keys: string[]) => {
			const oldBlobIds: string[] = [];
			for (const key of keys) {
				const row = get(stmtDelete({ key }));
				const maybeOldBlobId = row?.blob_id;
				if (maybeOldBlobId === null) {
					// If blob_id is null, this was a multipart object, so delete all
					// multipart parts
					const partRows = stmtDeletePartsByKey({ object_key: key });
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
		listMetadata: db.stmt<
			{
				limit: number;
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
      WHERE substr(key, 1, length(:prefix)) = :prefix
      AND (:start_after IS NULL OR key > :start_after)
      GROUP BY delimited_prefix_or_key -- Group keys with same delimited prefix into a row, leaving others in their own rows
      ORDER BY last_key LIMIT :limit;
    `),

		createMultipartUpload: db.stmt<Omit<MultipartUploadRow, "state">>(`
      INSERT INTO _mf_multipart_uploads (upload_id, key, http_metadata, custom_metadata, initiated_at)
      VALUES (:upload_id, :key, :http_metadata, :custom_metadata, :initiated_at)
    `),
		putPart: db.txn(
			(key: string, newRow: Omit<MultipartPartRow, "object_key">) => {
				// 1. Check the upload exists and is in-progress
				const uploadRow = get(
					stmtGetUploadState({
						key,
						upload_id: newRow.upload_id,
					})
				);
				if (uploadRow?.state !== MultipartUploadState.IN_PROGRESS) {
					throw new NoSuchUpload();
				}

				// 2. Check if we have an existing part with this number, then upsert
				const partRow = get(
					stmtGetPreviousPartByNumber({
						upload_id: newRow.upload_id,
						part_number: newRow.part_number,
					})
				);
				stmtPutPart(newRow);
				return partRow?.blob_id;
			}
		),
		completeMultipartUpload: db.txn(
			(
				key: string,
				upload_id: string,
				selectedParts: R2PublishedPart[],
				minPartSize: number
			) => {
				// 1. Check the upload exists and is in-progress
				const uploadRow = get(stmtGetUploadMetadata({ key, upload_id }));
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
				const uploadedPartRows = stmtListPartsByUploadId({ upload_id });
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
					if (part.size < minPartSize) {
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
					// noinspection JSUnusedAssignment
					partSize ??= part.size;
					if (part.size < minPartSize || part.size !== partSize) {
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
				const existingRow = get(stmtGetPreviousByKey({ key }));
				const maybeOldBlobId = existingRow?.blob_id;
				if (maybeOldBlobId === null) {
					// If blob_id is null, this was a multipart object, so delete all
					// multipart parts
					const partRows = stmtDeletePartsByKey({ object_key: key });
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
				stmtPut(newRow);
				for (const part of parts) {
					stmtLinkPart({
						upload_id,
						part_number: part.part_number,
						object_key: key,
					});
				}

				// 7. Delete unlinked, unused parts
				const partRows = stmtDeleteUnlinkedPartsByUploadId({ upload_id });
				for (const partRow of partRows) oldBlobIds.push(partRow.blob_id);

				// 8. Mark the upload as completed
				stmtUpdateUploadState({
					upload_id,
					state: MultipartUploadState.COMPLETED,
				});

				return { newRow, oldBlobIds };
			}
		),
		abortMultipartUpload: db.txn((key: string, upload_id: string) => {
			// 1. Make sure this multipart upload exists, ignoring finalised states
			const uploadRow = get(stmtGetUploadState({ key, upload_id }));
			if (uploadRow === undefined) {
				throw new InternalError();
			} else if (uploadRow.state > MultipartUploadState.IN_PROGRESS) {
				// If this upload has already been finalised, return here. `abort()` can
				// be called multiple times, and on already `complete()`ed uploads. In
				// the later case, we really don't want to delete pointed-to parts.
				return [];
			}

			// 2. Delete all parts in the upload
			const partRows = all(stmtDeletePartsByUploadId({ upload_id }));
			const oldBlobIds = partRows.map(({ blob_id }) => blob_id);

			// 3. Mark the uploaded as aborted
			stmtUpdateUploadState({
				upload_id,
				state: MultipartUploadState.ABORTED,
			});

			return oldBlobIds;
		}),
		listPartsWithPagination: stmtListPartsWithPagination,
		listMultipartUploads: stmtListMultipartUploads,
		getUploadState: stmtGetUploadState,
	};
}

// noinspection JSUnusedGlobalSymbols
export class R2BucketObject extends MiniflareDurableObject {
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

	constructor(state: DurableObjectState, env: MiniflareDurableObjectEnv) {
		super(state, env);
		this.db.exec("PRAGMA case_sensitive_like = TRUE");
		this.db.exec(SQL_SCHEMA);
		this.#migrateSchema();
		this.#stmts = sqlStmts(this.db);
	}

	#migrateSchema() {
		// Check if we need to add timestamp columns (backwards compatibility)
		// This migration is idempotent - it's safe to run multiple times

		// Check if initiated_at column exists in _mf_multipart_uploads
		const uploadsColumns = all(
			this.db.exec<{ name: string }>(
				"SELECT name FROM pragma_table_info('_mf_multipart_uploads') WHERE name = 'initiated_at'"
			)
		);
		if (uploadsColumns.length === 0) {
			// Add initiated_at column if it doesn't exist
			this.db.exec(
				"ALTER TABLE _mf_multipart_uploads ADD COLUMN initiated_at INTEGER"
			);
		}
		// Backfill any rows with NULL initiated_at
		this.db.exec(
			`UPDATE _mf_multipart_uploads SET initiated_at = ${Date.now()} WHERE initiated_at IS NULL`
		);

		// Check if uploaded_at column exists in _mf_multipart_parts
		const partsColumns = all(
			this.db.exec<{ name: string }>(
				"SELECT name FROM pragma_table_info('_mf_multipart_parts') WHERE name = 'uploaded_at'"
			)
		);
		if (partsColumns.length === 0) {
			// Add uploaded_at column if it doesn't exist
			this.db.exec(
				"ALTER TABLE _mf_multipart_parts ADD COLUMN uploaded_at INTEGER"
			);
		}
		// Backfill any rows with NULL uploaded_at
		this.db.exec(
			`UPDATE _mf_multipart_parts SET uploaded_at = ${Date.now()} WHERE uploaded_at IS NULL`
		);
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
			return this.blob.delete(blobId).catch((e) => {
				console.error("R2BucketObject##backgroundDelete():", e);
			});
		});
	}

	#assembleMultipartValue(
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
		//
		// NOTE: we can't use `IdentityTransformStream` here as piping the readable
		// side of an `IdentityTransformStream` to the writable side of another
		// `IdentityTransformStream` is not supported:
		// https://github.com/cloudflare/workerd/blob/c6f439ca37c5fa34acc54a6df79214ae029ddf9f/src/workerd/api/streams/internal.c%2B%2B#L169
		// We'll be piping to an `IdentityTransformStream` when we encode the
		// metadata followed by this stream as the response body.
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
					const value = await this.blob.get(blobId, range);
					const msg = `Expected to find blob "${blobId}" for multipart value`;
					assert(value !== null, msg);
					await value.pipeTo(identity.writable, { preventClose: true });
					this.#releaseBlob(blobId);
				}
				await identity.writable.close();
			} catch (e) {
				await identity.writable.abort(e);
			} finally {
				for (; i < requiredParts.length; i++) {
					this.#releaseBlob(requiredParts[i].blobId);
				}
			}
		})();
		return identity.readable;
	}

	async #head(key: string): Promise<InternalR2Object> {
		validate.key(key);

		const row = get(this.#stmts.getByKey({ key }));
		if (row === undefined) throw new NoSuchKey();

		const range: R2Range = { offset: 0, length: row.size };
		return new InternalR2Object(row, range);
	}

	async #get(
		key: string,
		opts: InternalR2GetOptions
	): Promise<InternalR2ObjectBody | InternalR2Object> {
		validate.key(key);

		// Try to get this key, including multipart parts if it's multipart
		const result = this.#stmts.getPartsByKey(key);
		if (result === undefined) throw new NoSuchKey();
		const { row, parts } = result;

		// Validate pre-condition
		const defaultR2Range: R2Range = { offset: 0, length: row.size };
		try {
			validate.condition(row, opts.onlyIf);
		} catch (e) {
			if (e instanceof PreconditionFailed) {
				e.attach(new InternalR2Object(row, defaultR2Range));
			}
			throw e;
		}

		// Validate range, and convert to R2 range for return
		const range = validate.range(opts, row.size);
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
			value = this.#assembleMultipartValue(parts, range ?? defaultRange);
		} else {
			// Otherwise, just return a single part value
			value = await this.blob.get(row.blob_id, range);
			if (value === null) throw new NoSuchKey();
		}

		return new InternalR2ObjectBody(row, value, r2Range);
	}

	async #put(
		key: string,
		value: ReadableStream<Uint8Array>,
		valueSize: number,
		opts: InternalR2PutOptions
	): Promise<InternalR2Object> {
		// Store value in the blob store, computing required digests as we go
		// (this means we don't have to buffer the entire stream to compute them)
		const algorithms: DigestAlgorithm[] = [];
		for (const { name, field } of R2_HASH_ALGORITHMS) {
			// Always compute MD5 digest
			if (field === "md5" || opts[field] !== undefined) algorithms.push(name);
		}
		const digesting = new DigestingStream(algorithms);
		const blobId = await this.blob.put(value.pipeThrough(digesting));
		const digests = await digesting.digests;
		const md5Digest = digests.get("MD5");
		assert(md5Digest !== undefined);
		const md5DigestHex = md5Digest.toString("hex");

		const checksums = validate
			.key(key)
			.size(valueSize)
			.metadataSize(opts.customMetadata)
			.hash(digests, opts);
		const row: ObjectRow = {
			key,
			blob_id: blobId,
			version: generateVersion(),
			size: valueSize,
			etag: md5DigestHex,
			uploaded: Date.now(),
			checksums: JSON.stringify(checksums),
			http_metadata: JSON.stringify(opts.httpMetadata ?? {}),
			custom_metadata: JSON.stringify(opts.customMetadata ?? {}),
		};
		let oldBlobIds: string[] | undefined;
		try {
			oldBlobIds = this.#stmts.put(row, opts.onlyIf);
		} catch (e) {
			// Probably precondition failed. In any case, the put transaction failed,
			// so we're not storing a reference to the blob ID
			this.#backgroundDelete(blobId);
			throw e;
		}
		if (oldBlobIds !== undefined) {
			for (const blobId of oldBlobIds) this.#backgroundDelete(blobId);
		}
		return new InternalR2Object(row);
	}

	#delete(keys: string | string[]) {
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

	async #list(opts: InternalR2ListOptions): Promise<InternalR2Objects> {
		const prefix = opts.prefix ?? "";

		let limit = opts.limit ?? R2Limits.MAX_LIST_KEYS;
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
			return new InternalR2Object(row as Omit<ObjectRow, "blob_id">);
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
			prefix,
			start_after: startAfter ?? null,
			// Increase the queried limit by 1, if we return this many results, we
			// know there are more rows. We'll truncate to the original limit before
			// returning results.
			limit: limit + 1,
		};

		let objects: InternalR2Object[];
		const delimitedPrefixes: string[] = [];
		let nextCursorStartAfter: string | undefined;

		if (delimiter !== undefined) {
			const rows = all(this.#stmts.listMetadata({ ...params, delimiter }));

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
			const rows = all(query(params));

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

	async #createMultipartUpload(
		key: string,
		opts: InternalR2CreateMultipartUploadOptions
	): Promise<R2CreateMultipartUploadResponse> {
		validate.key(key);

		const uploadId = generateId();
		this.#stmts.createMultipartUpload({
			key,
			upload_id: uploadId,
			http_metadata: JSON.stringify(opts.httpMetadata ?? {}),
			custom_metadata: JSON.stringify(opts.customMetadata ?? {}),
			initiated_at: Date.now(),
		});
		return { uploadId };
	}

	async #uploadPart(
		key: string,
		uploadId: string,
		partNumber: number,
		value: ReadableStream<Uint8Array>,
		valueSize: number
	): Promise<R2UploadPartResponse> {
		validate.key(key);

		// Store value in the blob store, computing MD5 digest as we go
		const digesting = new DigestingStream(["MD5"]);
		const blobId = await this.blob.put(value.pipeThrough(digesting));
		const digests = await digesting.digests;
		const md5Digest = digests.get("MD5");
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
				uploaded_at: Date.now(),
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

	async #completeMultipartUpload(
		key: string,
		uploadId: string,
		parts: R2PublishedPart[]
	): Promise<InternalR2Object> {
		validate.key(key);
		const minPartSize = this.beingTested
			? R2Limits.MIN_MULTIPART_PART_SIZE_TEST
			: R2Limits.MIN_MULTIPART_PART_SIZE;
		const { newRow, oldBlobIds } = this.#stmts.completeMultipartUpload(
			key,
			uploadId,
			parts,
			minPartSize
		);
		for (const blobId of oldBlobIds) this.#backgroundDelete(blobId);
		return new InternalR2Object(newRow);
	}

	async #abortMultipartUpload(key: string, uploadId: string): Promise<void> {
		validate.key(key);
		const oldBlobIds = this.#stmts.abortMultipartUpload(key, uploadId);
		for (const blobId of oldBlobIds) this.#backgroundDelete(blobId);
	}

	async #listParts(
		key: string,
		uploadId: string,
		opts: InternalR2ListPartsOptions
	): Promise<R2ListPartsResponse> {
		validate.key(key);

		// Check if upload exists and get its state
		const uploadRow = get(
			this.#stmts.getUploadState({ key, upload_id: uploadId })
		);
		if (uploadRow === undefined) {
			throw new NoSuchUpload();
		}
		if (uploadRow.state !== MultipartUploadState.IN_PROGRESS) {
			throw new NoSuchUpload();
		}

		// Set defaults for pagination
		const maxParts = Math.min(opts.maxParts ?? 1000, 1000);
		const partNumberMarker = opts.partNumberMarker ?? null;

		// Get one extra part to check if there are more
		const parts = all(
			this.#stmts.listPartsWithPagination({
				upload_id: uploadId,
				part_number_marker: partNumberMarker,
				limit: maxParts + 1,
			})
		);

		// Check if results are truncated
		const truncated = parts.length > maxParts;
		const resultParts = truncated ? parts.slice(0, maxParts) : parts;
		const nextPartNumberMarker = truncated
			? resultParts[resultParts.length - 1].part_number
			: undefined;

		return {
			uploadId,
			object: key,
			parts: resultParts.map((part) => ({
				partNumber: part.part_number,
				etag: part.etag,
				size: part.size,
				uploaded: part.uploaded_at,
			})),
			truncated,
			nextPartNumberMarker,
		};
	}

	async #listMultipartUploads(
		opts: InternalR2ListMultipartUploadsOptions
	): Promise<R2ListMultipartUploadsResponse> {
		// Set defaults
		const limit = Math.min(opts.limit ?? 1000, 1000);
		const prefix = opts.prefix ?? "";
		const delimiter = opts.delimiter;

		// Handle cursor
		let startAfter: string | null = null;
		if (opts.cursor !== undefined) {
			startAfter = base64Decode(opts.cursor);
		}
		if (opts.startAfter !== undefined) {
			if (startAfter === null || opts.startAfter > startAfter) {
				startAfter = opts.startAfter;
			}
		}

		// Get one extra upload to check if there are more
		const uploads = all(
			this.#stmts.listMultipartUploads({
				limit: limit + 1,
				prefix,
				start_after: startAfter,
			})
		);

		// Process uploads and handle delimiter
		const resultUploads: Array<{
			uploadId: string;
			object: string;
			initiated: number;
			storageClass: string;
		}> = [];
		const delimitedPrefixes: string[] = [];
		const prefixSet = new Set<string>();

		for (let i = 0; i < Math.min(uploads.length, limit); i++) {
			const upload = uploads[i];

			// Handle delimiter logic similar to list objects
			if (delimiter !== undefined) {
				const keyAfterPrefix = upload.key.substring(prefix.length);
				const delimiterIndex = keyAfterPrefix.indexOf(delimiter);

				if (delimiterIndex !== -1) {
					// This key contains the delimiter after the prefix
					const delimitedPrefix =
						prefix +
						keyAfterPrefix.substring(0, delimiterIndex + delimiter.length);
					if (!prefixSet.has(delimitedPrefix)) {
						prefixSet.add(delimitedPrefix);
						delimitedPrefixes.push(delimitedPrefix);
					}
				} else {
					// No delimiter found, include the upload
					resultUploads.push({
						uploadId: upload.upload_id,
						object: upload.key,
						initiated: upload.initiated_at,
						storageClass: "Standard",
					});
				}
			} else {
				// No delimiter, include all uploads
				resultUploads.push({
					uploadId: upload.upload_id,
					object: upload.key,
					initiated: upload.initiated_at,
					storageClass: "Standard",
				});
			}
		}

		// Check truncation and get cursor
		const truncated = uploads.length > limit;
		const nextCursor = truncated
			? base64Encode(uploads[limit - 1].key)
			: undefined;

		return {
			uploads: resultUploads,
			truncated,
			cursor: nextCursor,
			delimitedPrefixes,
		};
	}

	@GET("/")
	get: RouteHandler = async (req) => {
		const metadata = decodeHeaderMetadata(req);

		if (metadata.method === "listParts") {
			const result = await this.#listParts(
				metadata.object,
				metadata.uploadId,
				metadata
			);
			return encodeJSONResult(result);
		} else if (metadata.method === "listMultipartUploads") {
			const result = await this.#listMultipartUploads(metadata);
			return encodeJSONResult(result);
		}

		let result: InternalR2Object | InternalR2ObjectBody | InternalR2Objects;
		if (metadata.method === "head") {
			result = await this.#head(metadata.object);
		} else if (metadata.method === "get") {
			result = await this.#get(metadata.object, metadata);
		} else if (metadata.method === "list") {
			result = await this.#list(metadata);
		} else {
			throw new InternalError();
		}

		return encodeResult(result);
	};

	@PUT("/")
	put: RouteHandler = async (req) => {
		const { metadata, metadataSize, value } = await decodeMetadata(req);

		if (metadata.method === "delete") {
			this.#delete("object" in metadata ? metadata.object : metadata.objects);
			return new Response();
		} else if (metadata.method === "put") {
			// Safety of `!`: `parseInt(null)` is `NaN`
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const contentLength = parseInt(req.headers.get("Content-Length")!);
			// `workerd` requires a known value size for R2 put requests:
			// - https://github.com/cloudflare/workerd/blob/e3479895a2ace28e4fd5f1399cea4c92291966ab/src/workerd/api/r2-rpc.c%2B%2B#L154-L156
			// - https://github.com/cloudflare/workerd/blob/e3479895a2ace28e4fd5f1399cea4c92291966ab/src/workerd/api/r2-rpc.c%2B%2B#L188-L189
			assert(!isNaN(contentLength));
			const valueSize = contentLength - metadataSize;
			const result = await this.#put(
				metadata.object,
				value,
				valueSize,
				metadata
			);
			return encodeResult(result);
		} else if (metadata.method === "createMultipartUpload") {
			const result = await this.#createMultipartUpload(
				metadata.object,
				metadata
			);
			return encodeJSONResult(result);
		} else if (metadata.method === "uploadPart") {
			// Safety of `!`: `parseInt(null)` is `NaN`
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const contentLength = parseInt(req.headers.get("Content-Length")!);
			// `workerd` requires a known value size for R2 put requests as above
			assert(!isNaN(contentLength));
			const valueSize = contentLength - metadataSize;
			const result = await this.#uploadPart(
				metadata.object,
				metadata.uploadId,
				metadata.partNumber,
				value,
				valueSize
			);
			return encodeJSONResult(result);
		} else if (metadata.method === "completeMultipartUpload") {
			const result = await this.#completeMultipartUpload(
				metadata.object,
				metadata.uploadId,
				metadata.parts
			);
			return encodeResult(result);
		} else if (metadata.method === "abortMultipartUpload") {
			await this.#abortMultipartUpload(metadata.object, metadata.uploadId);
			return new Response();
		} else {
			throw new InternalError(); // Unknown method: should never be reached
		}
	};
}
