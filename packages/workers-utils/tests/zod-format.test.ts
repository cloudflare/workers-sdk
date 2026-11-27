import assert from "node:assert";
import { formatZodError } from "@cloudflare/workers-utils";
import { test } from "vitest";
import { z } from "zod";

test("formats Zod errors for CLI output", ({ expect }) => {
	const result = z
		.object({
			name: z.string(),
			workers: z.array(z.object({ compatibilityDate: z.string() })),
		})
		.safeParse({
			name: 42,
			workers: [{ compatibilityDate: false }],
		});
	assert(!result.success);

	expect(formatZodError(result.error)).toMatchInlineSnapshot(`
		"✖ Invalid input: expected string, received number
		  → at name
		✖ Invalid input: expected string, received boolean
		  → at workers[0].compatibilityDate"
	`);
});
