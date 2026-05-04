import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { unstable_getVarsForDev } from "wrangler";
import { quoteForDotenv } from "../dev-vars";

/**
 * The values produced by `quoteForDotenv` end up in `dist/<env>/.dev.vars`
 * and are read back at preview time by wrangler. These tests pin the
 * round-trip through wrangler's own loader so the contract — not just
 * dotenv's specific behaviour — is what's verified.
 */
describe("quoteForDotenv", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), "vite-plugin-dev-vars-"));
		writeFileSync(path.join(dir, "wrangler.json"), "{}");
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	function roundTrip(value: string): string | undefined {
		writeFileSync(
			path.join(dir, ".dev.vars"),
			`KEY=${quoteForDotenv(value)}\n`
		);
		const vars = unstable_getVarsForDev(
			path.join(dir, "wrangler.json"),
			undefined,
			{},
			undefined,
			true
		);
		const binding = vars.KEY;
		return binding && "value" in binding && typeof binding.value === "string"
			? binding.value
			: undefined;
	}

	const cases: { name: string; input: string }[] = [
		{ name: "plain string", input: "hello" },
		{ name: "string with spaces", input: "hello world" },
		{ name: "leading and trailing whitespace", input: "  spaces  " },
		{ name: "empty string", input: "" },
		{
			name: "JSON-encoded JWK (contains double quotes)",
			input: '{"kty":"OKP","crv":"Ed25519","x":"abc","d":"xyz"}',
		},
		{ name: "value with single quote", input: "it's complicated" },
		{
			name: "value with both single and double quotes",
			input: `she said "it's fine"`,
		},
		{
			name: "value with single quote and backslash",
			input: "it's C:\\path\\to\\file",
		},
		{
			name: "value with single quote and literal \\n",
			input: String.raw`it's \n literal`,
		},
		{ name: "value with backslashes", input: "C:\\path\\to\\file" },
		{ name: "value that looks like ${expansion}", input: "${NOT_REPLACED}" },
		{ name: "value with hash", input: "abc # not a comment" },
		{ name: "value with actual newline", input: "line1\nline2" },
	];

	for (const { name, input } of cases) {
		test(`round-trips: ${name}`, () => {
			expect(roundTrip(input)).toBe(input);
		});
	}

	test("throws when a value cannot be losslessly serialized", () => {
		// Contains all three quote characters — no safe encoding under dotenv.
		expect(() => quoteForDotenv("'`\"")).toThrowError(
			/Unable to serialize value to \.dev\.vars/
		);
	});
});
