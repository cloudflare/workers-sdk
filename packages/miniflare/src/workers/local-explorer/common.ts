import { validator } from "hono/validator";
import { z } from "zod";
import type { AppBindings } from "./api.worker";
import type {
	WorkersKvApiResponseCommon,
	WorkersKvMessages,
} from "./generated/types.gen";
import type { Context } from "hono";

export type AppContext = Context<AppBindings>;

// ============================================================================
// Hono middleware Validators
// ============================================================================

/**
 * Query validator with string-to-type coercion.
 * Query params arrive as strings from URLs, so we coerce them before validation.
 * @returns validated query params according to openapi schema
 *
 * If the whole query param is optional, you need to unwrap it before passing to this function.
 */
export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
	return validator("query", async (value, c) => {
		let result: z.SafeParseReturnType<z.input<T>, z.output<T>>;
		try {
			const coerced = coerceValue(schema, value);
			result = await schema.safeParseAsync(coerced);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return validationHook({ success: false, error }, c);
			}
			throw error;
		}
		if (!result.success) {
			return validationHook(result, c);
		}
		return result.data as z.output<T>;
	});
}

/**
 * validates request body according to openapi schema
 */
export function validateRequestBody<T extends z.ZodTypeAny>(schema: T) {
	return validator("json", async (value, c) => {
		const result = await schema.safeParseAsync(value);
		if (!result.success) {
			return validationHook(result, c);
		}
		return result.data as z.output<T>;
	});
}

/**
 * Coerce a single value to match the expected schema type.
 * Query params arrive as strings but schemas may expect numbers, booleans, or arrays.
 * Throw a validation error if coercion is not possible.
 *
 * We handle this manually rather than using Zod's built-in coercion because:
 * 1. Booleans: Zod's coercion turns "false" into true (any non-empty string is truthy)
 * 2. Numbers: Generated schemas use z.number() not z.coerce.number(), so we must coercem
 * 3. Arrays/Objects: We need to recursively coerce nested values
 */
export function coerceValue(
	schema: z.ZodTypeAny,
	value: unknown,
	path: (string | number)[] = []
): unknown {
	// Unwrap optional/default to get inner type
	if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
		if (value === undefined) return value;
		return coerceValue(schema._def.innerType, value, path);
	}

	if (schema instanceof z.ZodNumber && typeof value === "string") {
		const num = Number(value);
		if (isNaN(num)) {
			throw new z.ZodError([
				{
					code: z.ZodIssueCode.invalid_type,
					expected: "number",
					received: "string",
					path,
					message: `Expected query param to be number but received "${value}"`,
				},
			]);
		}
		return num;
	}

	if (schema instanceof z.ZodBoolean && typeof value === "string") {
		if (value === "true") return true;
		if (value === "false") return false;
		throw new z.ZodError([
			{
				code: z.ZodIssueCode.invalid_type,
				expected: "boolean",
				received: "string",
				path,
				message: `Expected query param to be 'true' or 'false' but received "${value}"`,
			},
		]);
	}

	if (schema instanceof z.ZodArray && Array.isArray(value)) {
		return value.map((item, index) =>
			coerceValue(schema.element, item, [...path, index])
		);
	}

	if (
		schema instanceof z.ZodObject &&
		typeof value === "object" &&
		value !== null
	) {
		const result: Record<string, unknown> = {};
		for (const [key, propSchema] of Object.entries(schema.shape)) {
			if (key in value) {
				result[key] = coerceValue(
					propSchema as z.ZodTypeAny,
					(value as Record<string, unknown>)[key],
					[...path, key]
				);
			}
		}
		return result;
	}
	return value;
}

/**
 * Error hook for zValidator that returns Cloudflare API error format.
 */
export function validationHook(
	result: { success: false; error: z.ZodError },
	c: Context
): Response {
	const errors = result.error.errors.map((e) => ({
		code: 10001,
		message: `${e.path.join(".")}: ${e.message}`,
	}));
	return c.json({ success: false, errors, messages: [], result: null }, 400);
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Wrap a result in the Cloudflare API response envelope
 */
export function wrapResponse<T>(
	result: T
): WorkersKvApiResponseCommon & { result: T } {
	return {
		success: true,
		errors: [] as WorkersKvMessages,
		messages: [] as WorkersKvMessages,
		result,
	};
}

/**
 * Create an error response in the Cloudflare API format
 */
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
