import { ValueOf } from "miniflare:shared";
import { Base64DataSchema, HexDataSchema, z } from "miniflare:zod";

export type ObjectRow = {
	key: string;
	blob_id: string | null; // null if multipart
	version: string;
	size: number; // total size of object (all parts) in bytes
	etag: string; // hex MD5 hash if not multipart
	uploaded: number; // milliseconds since unix epoch
	checksums: string; // JSON-serialised `R2StringChecksums` (workers-types)
	http_metadata: string; // JSON-serialised `R2HTTPMetadata` (workers-types)
	custom_metadata: string; // JSON-serialised user-defined metadata
};
export const MultipartUploadState = {
	IN_PROGRESS: 0,
	COMPLETED: 1,
	ABORTED: 2,
} as const;
export type MultipartUploadRow = {
	upload_id: string;
	key: string;
	http_metadata: string; // JSON-serialised `R2HTTPMetadata` (workers-types)
	custom_metadata: string; // JSON-serialised user-defined metadata
	state: ValueOf<typeof MultipartUploadState>;
	// NOTE: we need to keep completed/aborted uploads around for referential
	// integrity, and because error messages are different when attempting to
	// upload parts to them
};
export type MultipartPartRow = {
	upload_id: string;
	part_number: number;
	blob_id: string;
	size: number; // NOTE: used to identify which parts to read for range requests
	etag: string; // NOTE: multipart part ETag's are not MD5 checksums
	checksum_md5: string; // NOTE: used in construction of final object's ETag
	object_key: string | null; // null if in-progress upload
};
export const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS _mf_objects (
    key TEXT PRIMARY KEY,
    blob_id TEXT,
    version TEXT NOT NULL,
    size INTEGER NOT NULL,
    etag TEXT NOT NULL,
    uploaded INTEGER NOT NULL,
    checksums TEXT NOT NULL,
    http_metadata TEXT NOT NULL,
    custom_metadata TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS _mf_multipart_uploads (
    upload_id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    http_metadata TEXT NOT NULL,
    custom_metadata TEXT NOT NULL,
    state TINYINT DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS _mf_multipart_parts (
    upload_id TEXT NOT NULL REFERENCES _mf_multipart_uploads(upload_id),
    part_number INTEGER NOT NULL,
    blob_id TEXT NOT NULL,
    size INTEGER NOT NULL,
    etag TEXT NOT NULL,
    checksum_md5 TEXT NOT NULL,
    object_key TEXT REFERENCES _mf_objects(key) DEFERRABLE INITIALLY DEFERRED,
    PRIMARY KEY (upload_id, part_number)
);
`;
// NOTE: `object_key` foreign key constraint is deferred, meaning we can delete
// the linked object row, *then* the multipart part rows in a transaction,
// see https://www.sqlite.org/foreignkeys.html#fk_deferred for more details

// https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-api.capnp

export const DateSchema = z.coerce
	.number()
	.transform((value) => new Date(value));

export const RecordSchema = z
	.object({
		k: z.string(),
		v: z.string(),
	})
	.array()
	.transform((entries) =>
		Object.fromEntries(entries.map(({ k, v }) => [k, v]))
	);
export type RawRecord = z.input<typeof RecordSchema>;

export const R2RangeSchema = z.object({
	offset: z.coerce.number().optional(),
	length: z.coerce.number().optional(),
	suffix: z.coerce.number().optional(),
});
export type R2Range = z.infer<typeof R2RangeSchema>;

export const R2EtagSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("strong"), value: z.string() }),
	z.object({ type: z.literal("weak"), value: z.string() }),
	z.object({ type: z.literal("wildcard") }),
]);
export type R2Etag = z.infer<typeof R2EtagSchema>;
export const R2EtagMatchSchema = R2EtagSchema.array().min(1).optional();

// For more information, refer to https://datatracker.ietf.org/doc/html/rfc7232
export const R2ConditionalSchema = z.object({
	// Performs the operation if the object's ETag matches the given string
	etagMatches: R2EtagMatchSchema, // "If-Match"
	// Performs the operation if the object's ETag does NOT match the given string
	etagDoesNotMatch: R2EtagMatchSchema, // "If-None-Match"
	// Performs the operation if the object was uploaded BEFORE the given date
	uploadedBefore: DateSchema.optional(), // "If-Unmodified-Since"
	// Performs the operation if the object was uploaded AFTER the given date
	uploadedAfter: DateSchema.optional(), // "If-Modified-Since"
	// Truncates dates to seconds before performing comparisons
	secondsGranularity: z.boolean().optional(),
});
export type R2Conditional = z.infer<typeof R2ConditionalSchema>;

export const R2ChecksumsSchema = z
	.object({
		0: HexDataSchema.optional(),
		1: HexDataSchema.optional(),
		2: HexDataSchema.optional(),
		3: HexDataSchema.optional(),
		4: HexDataSchema.optional(),
	})
	.transform((checksums) => ({
		md5: checksums["0"],
		sha1: checksums["1"],
		sha256: checksums["2"],
		sha384: checksums["3"],
		sha512: checksums["4"],
	}));
export type RawR2Checksums = z.input<typeof R2ChecksumsSchema>;
export type R2Checksums = z.infer<typeof R2ChecksumsSchema>;

export const R2PublishedPartSchema = z.object({
	etag: z.string(),
	part: z.number(),
});
export type R2PublishedPart = z.infer<typeof R2PublishedPartSchema>;

export const R2HttpFieldsSchema = z.object({
	contentType: z.string().optional(),
	contentLanguage: z.string().optional(),
	contentDisposition: z.string().optional(),
	contentEncoding: z.string().optional(),
	cacheControl: z.string().optional(),
	cacheExpiry: z.coerce.number().optional(),
});
export type R2HttpFields = z.infer<typeof R2HttpFieldsSchema>;

export const R2HeadRequestSchema = z.object({
	method: z.literal("head"),
	object: z.string(),
});

export const R2GetRequestSchema = z.object({
	method: z.literal("get"),
	object: z.string(),
	// Specifies that only a specific length (from an optional offset) or suffix
	// of bytes from the object should be returned. Refer to
	// https://developers.cloudflare.com/r2/runtime-apis/#ranged-reads.
	range: R2RangeSchema.optional(),
	rangeHeader: z.string().optional(),
	// Specifies that the object should only be returned given satisfaction of
	// certain conditions in the R2Conditional. Refer to R2Conditional above.
	onlyIf: R2ConditionalSchema.optional(),
});

export const R2PutRequestSchema = z
	.object({
		method: z.literal("put"),
		object: z.string(),
		customFields: RecordSchema.optional(), // (renamed in transform)
		httpFields: R2HttpFieldsSchema.optional(), // (renamed in transform)
		onlyIf: R2ConditionalSchema.optional(),
		md5: Base64DataSchema.optional(), // (intentionally base64, not hex)
		sha1: HexDataSchema.optional(),
		sha256: HexDataSchema.optional(),
		sha384: HexDataSchema.optional(),
		sha512: HexDataSchema.optional(),
	})
	.transform((value) => ({
		method: value.method,
		object: value.object,
		customMetadata: value.customFields,
		httpMetadata: value.httpFields,
		onlyIf: value.onlyIf,
		md5: value.md5,
		sha1: value.sha1,
		sha256: value.sha256,
		sha384: value.sha384,
		sha512: value.sha512,
	}));

export const R2CreateMultipartUploadRequestSchema = z
	.object({
		method: z.literal("createMultipartUpload"),
		object: z.string(),
		customFields: RecordSchema.optional(), // (renamed in transform)
		httpFields: R2HttpFieldsSchema.optional(), // (renamed in transform)
	})
	.transform((value) => ({
		method: value.method,
		object: value.object,
		customMetadata: value.customFields,
		httpMetadata: value.httpFields,
	}));

export const R2UploadPartRequestSchema = z.object({
	method: z.literal("uploadPart"),
	object: z.string(),
	uploadId: z.string(),
	partNumber: z.number(),
});

export const R2CompleteMultipartUploadRequestSchema = z.object({
	method: z.literal("completeMultipartUpload"),
	object: z.string(),
	uploadId: z.string(),
	parts: R2PublishedPartSchema.array(),
});

export const R2AbortMultipartUploadRequestSchema = z.object({
	method: z.literal("abortMultipartUpload"),
	object: z.string(),
	uploadId: z.string(),
});

export const R2ListRequestSchema = z.object({
	method: z.literal("list"),
	limit: z.number().optional(),
	prefix: z.string().optional(),
	cursor: z.string().optional(),
	delimiter: z.string().optional(),
	startAfter: z.string().optional(),
	include: z
		.union([z.literal(0), z.literal(1)])
		.transform((value) => (value === 0 ? "httpMetadata" : "customMetadata"))
		.array()
		.optional(),
});

export const R2DeleteRequestSchema = z.intersection(
	z.object({ method: z.literal("delete") }),
	z.union([
		z.object({ object: z.string() }),
		z.object({ objects: z.string().array() }),
	])
);

// Not using `z.discriminatedUnion()` here, as that doesn't work with
// intersection/transformed types.
// TODO(someday): switch to proposed `z.switch()`: https://github.com/colinhacks/zod/issues/2106
export const R2BindingRequestSchema = z.union([
	R2HeadRequestSchema,
	R2GetRequestSchema,
	R2PutRequestSchema,
	R2CreateMultipartUploadRequestSchema,
	R2UploadPartRequestSchema,
	R2CompleteMultipartUploadRequestSchema,
	R2AbortMultipartUploadRequestSchema,
	R2ListRequestSchema,
	R2DeleteRequestSchema,
]);

export type OmitRequest<T> = Omit<T, "method" | "object">;
export type InternalR2GetOptions = OmitRequest<
	z.infer<typeof R2GetRequestSchema>
>;
export type InternalR2PutOptions = OmitRequest<
	z.infer<typeof R2PutRequestSchema>
>;
export type InternalR2ListOptions = OmitRequest<
	z.infer<typeof R2ListRequestSchema>
>;
export type InternalR2CreateMultipartUploadOptions = OmitRequest<
	z.infer<typeof R2CreateMultipartUploadRequestSchema>
>;

export interface R2ErrorResponse {
	version: number;
	v4code: number;
	message: string;
}

export interface R2HeadResponse {
	name: string;
	version: string;
	size: number;
	etag: string;
	uploaded: number;
	// Optional: https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-bucket.c%2B%2B#L81
	httpFields?: R2HttpFields;
	// Optional: https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-bucket.c%2B%2B#L113
	customFields?: RawRecord;
	// Optional: https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-bucket.c%2B%2B#L130
	range?: R2Range;
	// Optional: https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-bucket.c%2B%2B#L140
	checksums?: RawR2Checksums;
}

export type R2GetResponse = R2HeadResponse;

export type R2PutResponse = R2HeadResponse;

export interface R2CreateMultipartUploadResponse {
	uploadId: string;
}

export interface R2UploadPartResponse {
	etag: string;
}

export type R2CompleteMultipartUploadResponse = R2PutResponse;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface R2AbortMultipartUploadResponse {}

export interface R2ListResponse {
	objects: R2HeadResponse[];
	truncated: boolean;
	cursor?: string;
	delimitedPrefixes: string[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface R2DeleteResponse {}
