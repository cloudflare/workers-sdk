import { z } from "zod";

// https://github.com/cloudflare/workerd/blob/4290f9717bc94647d9c8afd29602cdac97fdff1b/src/workerd/api/r2-api.capnp

export const HEX_REGEXP = /^[0-9a-f]*$/i;
// https://github.com/capnproto/capnproto/blob/6b5bcc2c6e954bc6e167ac581eb628e5a462a469/c%2B%2B/src/kj/encoding.c%2B%2B#L719-L720
export const BASE64_REGEXP = /^[0-9a-z+/=]*$/i;

export const DateSchema = z.coerce
	.number()
	.transform((value) => new Date(value));
export const HexDataSchema = z
	.string()
	.regex(HEX_REGEXP)
	.transform((hex) => Buffer.from(hex, "hex"));
export const Base64DataSchema = z
	.string()
	.regex(BASE64_REGEXP)
	.transform((base64) => Buffer.from(base64, "base64"));

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

// For more information, refer to https://datatracker.ietf.org/doc/html/rfc7232
export const R2ConditionalSchema = z.object({
	// Performs the operation if the object's ETag matches the given string
	etagMatches: z.ostring(), // "If-Match"
	// Performs the operation if the object's ETag does NOT match the given string
	etagDoesNotMatch: z.ostring(), // "If-None-Match"
	// Performs the operation if the object was uploaded BEFORE the given date
	uploadedBefore: DateSchema.optional(), // "If-Unmodified-Since"
	// Performs the operation if the object was uploaded AFTER the given date
	uploadedAfter: DateSchema.optional(), // "If-Modified-Since"
	// Truncates dates to seconds before performing comparisons
	secondsGranularity: z.oboolean(),
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
	contentType: z.ostring(),
	contentLanguage: z.ostring(),
	contentDisposition: z.ostring(),
	contentEncoding: z.ostring(),
	cacheControl: z.ostring(),
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
	rangeHeader: z.ostring(),
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
		md5: Base64DataSchema.optional(), // (intentionally base64, not hex)  // TODO: make sure we're testing this is base64
		sha1: HexDataSchema.optional(), // TODO: support
		sha256: HexDataSchema.optional(), // TODO: support
		sha384: HexDataSchema.optional(), // TODO: support
		sha512: HexDataSchema.optional(), // TODO: support
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

// TODO: support multipart
export const R2CreateMultipartUploadRequestSchema = z.object({
	method: z.literal("createMultipartUpload"),
	object: z.string(),
	customFields: RecordSchema.optional(),
	httpFields: R2HttpFieldsSchema.optional(),
});

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
	limit: z.onumber(),
	prefix: z.ostring(),
	cursor: z.ostring(),
	delimiter: z.ostring(),
	startAfter: z.ostring(),
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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface R2AbortMultipartUploadResponse {}

export interface R2ListResponse {
	objects: R2HeadResponse[];
	truncated: boolean;
	cursor?: string;
	delimitedPrefixes: string[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface R2DeleteResponse {}
