import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test } from "vitest";
import * as wrangler from "wrangler";
import { getLocalDevVarsForPreview, quoteForDotenv } from "../dev-vars";

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
	afterEach(() => removeDirSync(dir));

	function roundTrip(value: string): string | undefined {
		writeFileSync(
			path.join(dir, ".dev.vars"),
			`KEY=${quoteForDotenv(value)}\n`
		);
		const vars = wrangler.unstable_getVarsForDev(
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
		test(`round-trips: ${name}`, ({ expect }) => {
			expect(roundTrip(input)).toBe(input);
		});
	}

	test("throws when a value cannot be losslessly serialized", ({ expect }) => {
		// Contains all three quote characters — no safe encoding under dotenv.
		expect(() => quoteForDotenv("'`\"")).toThrowError(
			/Unable to serialize value to \.dev\.vars/
		);
	});
});

/**
 * Integration test: prove `getLocalDevVarsForPreview` actually wires
 * `quoteForDotenv` into the path that ends up at `dist/<env>/.dev.vars`,
 * so the value a user wrote in their project's `.dev.vars` round-trips
 * through to the preview server.
 */
describe("getLocalDevVarsForPreview", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), "vite-plugin-dev-vars-int-"));
	});
	afterEach(() => removeDirSync(dir));

	test("re-emits a .dev.vars value containing quotes losslessly", ({
		expect,
	}) => {
		const inputDir = path.join(dir, "input");
		const outputDir = path.join(dir, "output");
		mkdirSync(inputDir);
		mkdirSync(outputDir);

		// A user's hand-written .dev.vars. Single-quoted form is read literally
		// by dotenv, so this is the canonical way to embed a JSON value.
		const value = '{"jwk":"contains \\"quotes\\""}';
		writeFileSync(path.join(inputDir, "wrangler.json"), "{}");
		writeFileSync(path.join(inputDir, ".dev.vars"), `KEY='${value}'\n`);

		const config = wrangler.unstable_readConfig({
			config: path.join(inputDir, "wrangler.json"),
		});
		const serialized = getLocalDevVarsForPreview(config, undefined);
		expect(serialized).toBeDefined();

		writeFileSync(path.join(outputDir, "wrangler.json"), "{}");
		writeFileSync(path.join(outputDir, ".dev.vars"), serialized ?? "");

		const vars = wrangler.unstable_getVarsForDev(
			path.join(outputDir, "wrangler.json"),
			undefined,
			{},
			undefined,
			true
		);
		const binding = vars.KEY;
		const got =
			binding && "value" in binding && typeof binding.value === "string"
				? binding.value
				: undefined;
		expect(got).toBe(value);
	});
});
