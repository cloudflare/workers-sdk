import { z } from "zod";

/** Formats a Zod validation error for CLI output. */
export function formatZodError(
	error: Parameters<typeof z.prettifyError>[0]
): string {
	return z.prettifyError(error);
}
