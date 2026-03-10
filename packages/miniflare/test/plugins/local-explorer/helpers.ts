// eslint-disable-next-line workers-sdk/no-vitest-import-expect -- see #12346
import { expect } from "vitest";
import { z } from "zod";

/**
 * Validates a response body against a Zod schema and returns typed data.
 * Throws a descriptive error if validation fails.
 */
export async function expectValidResponse<T extends z.ZodTypeAny>(
	response: Response,
	schema: T,
	expectedStatus = 200
): Promise<z.infer<T>> {
	expect(response.status).toBe(expectedStatus);
	const json = await response.json();
	const result = schema.safeParse(json);

	if (!result.success) {
		throw new Error(
			`Response validation failed:\n${JSON.stringify(result.error.format(), null, 2)}\n\nActual response:\n${JSON.stringify(json, null, 2)}`
		);
	}

	return result.data;
}
