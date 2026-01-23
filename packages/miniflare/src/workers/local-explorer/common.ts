import { z } from "zod";

export const ResponseInfoSchema = z.object({
	code: z.number(),
	message: z.string(),
});

export const PageResultInfoSchema = z.object({
	count: z.number(),
	page: z.number(),
	per_page: z.number(),
	total_count: z.number(),
});

export const CursorResultInfoSchema = z.object({
	count: z.number(),
	cursor: z.string(),
});

export const CloudflareEnvelope = <T extends z.ZodTypeAny>(resultSchema: T) =>
	z.object({
		success: z.boolean(),
		errors: z.array(ResponseInfoSchema),
		messages: z.array(ResponseInfoSchema),
		result: resultSchema,
	});

// ============================================================================
// Response Helpers
// ============================================================================

export function wrapResponse<T>(result: T) {
	return {
		success: true as const,
		errors: [] as { code: number; message: string }[],
		messages: [] as { code: number; message: string }[],
		result,
	};
}

export function errorResponse(status: number, code: number, message: string) {
	return Response.json(
		{
			success: false,
			errors: [{ code, message }],
			messages: [],
			result: null,
		},
		{ status }
	);
}
