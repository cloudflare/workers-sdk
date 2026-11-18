import { z } from "miniflare:zod";
import { D1FailureResponseSchema } from "./schemas";
import type { D1Query, D1RpcResultData } from "./schemas";

/** Local-only pragma used to export a database's SQL schema and data. */
export const D1_EXPORT_PRAGMA = "PRAGMA miniflare_d1_export(?,?,?);";

/** Export flags followed by an optional list of table names. */
export type D1ExportPragma = [
	{ sql: typeof D1_EXPORT_PRAGMA; params: [number, number, ...string[]] },
];

/** Matches the database worker's existing local export dispatch rules. */
export function isD1ExportPragma(
	queries: D1Query[]
): queries is D1ExportPragma {
	return (
		queries.length === 1 &&
		queries[0].sql === D1_EXPORT_PRAGMA &&
		(queries[0].params?.length || 0) >= 2
	);
}

const D1ExportMetaSchema = z.record(z.string(), z.never());
type D1ExportMeta = z.infer<typeof D1ExportMetaSchema>;

const D1ExportResponseSchema = z.union([
	z.object({
		success: z.literal(true),
		results: z.tuple([z.array(z.string())]),
		meta: D1ExportMetaSchema,
	}),
	D1FailureResponseSchema,
]);

/** Local exports return one dump row and do not report execution metadata. */
export interface D1RpcExportResponse {
	results: [{ meta: D1ExportMeta; data: D1RpcResultData }];
}

/** Adapts the legacy local export response, throwing backend failures over RPC. */
export function parseD1RpcExportResponse(input: unknown): D1RpcExportResponse {
	const body = D1ExportResponseSchema.parse(input);
	if (!body.success) {
		const error = new Error(body.error);
		error.name = "D1_ERROR";
		throw error;
	}

	return {
		results: [
			{
				meta: body.meta,
				data: {
					kind: "raw",
					// The HTTP wrapper exposes the export row's array indices
					// as column names; preserve that convention over RPC.
					columns: body.results[0].map((_, index) => String(index)),
					rows: body.results,
				},
			},
		],
	};
}
