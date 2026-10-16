import { z } from "miniflare:zod";

/** Internal bookmark header shared by the workerd wrapper and D1 backend. */
export const D1_SESSION_COMMIT_TOKEN_HTTP_HEADER =
	"x-cf-d1-session-commit-token";

/** JSON representation of SQLite values used by the D1 HTTP protocol. */
export const D1ValueSchema = z.union([
	z.number(),
	z.string(),
	z.null(),
	z.number().array(),
]);
/** Blobs use numeric byte arrays rather than ArrayBuffers on the wire. */
export type D1Value = z.infer<typeof D1ValueSchema>;

/** SQL and positional parameters accepted by the local database worker. */
export const D1QuerySchema = z.object({
	sql: z.string(),
	params: z.array(D1ValueSchema).nullable().optional(),
});
/** Parameters are converted to SQLite values by the database worker. */
export type D1Query = z.infer<typeof D1QuerySchema>;

/** The HTTP protocol accepts either one query or a transactional batch. */
export const D1QueriesSchema = z.union([D1QuerySchema, z.array(D1QuerySchema)]);

/** RPC queries always contain a batch and may specify a session bookmark. */
export const D1RpcRequestSchema = z.object({
	queries: z.array(D1QuerySchema),
	bookmark: z.string().optional(),
});
/** The bookmark may also be a first-query routing constraint. */
export type D1RpcRequest = z.infer<typeof D1RpcRequestSchema>;

/** D1 query metadata; geography is optional because local execution has no colo. */
export const D1MetaSchema = z.object({
	served_by: z.string(),
	served_by_primary: z.boolean().optional(),
	served_by_region: z.string().optional(),
	served_by_colo: z.string().optional(),
	timings: z.object({ sql_duration_ms: z.number() }).optional(),
	duration: z.number(),
	changes: z.number(),
	last_row_id: z.number(),
	changed_db: z.boolean(),
	size_after: z.number(),
	rows_read: z.number(),
	rows_written: z.number(),
	total_attempts: z.number().optional(),
});
/** SQL duration excludes request handling and result serialization. */
export type D1Meta = z.infer<typeof D1MetaSchema>;

/** Rows-and-columns results preserve duplicate column names and empty rows. */
export const D1RowsAndColumnsSchema = z.object({
	columns: z.array(z.string()),
	rows: z.array(z.array(D1ValueSchema)),
});
/** Column names are positional and need not be unique. */
export type D1RowsAndColumns = z.infer<typeof D1RowsAndColumnsSchema>;

const D1RowsAndColumnsSuccessSchema = z.object({
	success: z.literal(true),
	results: D1RowsAndColumnsSchema,
	meta: D1MetaSchema,
});

/** A backend failure contains no successful query or export results. */
export const D1FailureResponseSchema = z.object({
	success: z.literal(false),
	error: z.string(),
});

/** A query failure is returned instead of any successful HTTP batch results. */
export const D1RowsAndColumnsResponseSchema = z.union([
	z.array(D1RowsAndColumnsSuccessSchema),
	D1FailureResponseSchema,
]);

/** The RPC discriminator identifies the rows-and-columns payload to workerd. */
export interface D1RpcResultData extends D1RowsAndColumns {
	kind: "raw";
}

/** RPC successes return results directly; failures are thrown instead. */
export interface D1RpcResponse {
	results: {
		meta: D1Meta;
		data: D1RpcResultData;
	}[];
	bookmark?: string;
}
