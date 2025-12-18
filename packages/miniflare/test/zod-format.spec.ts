import assert from "node:assert";
import { _forceColour, formatZodError } from "miniflare";
import { expect, test } from "vitest";
import { z } from "zod";

function testFormatZodError(
	schema: z.ZodTypeAny,
	input: unknown,
	colour?: boolean
) {
	const result = schema.safeParse(input);
	assert(!result.success);
	// Disable colours by default for easier-to-read snapshots
	_forceColour(colour ?? false);
	const formatted = formatZodError(result.error, input);
	expect(formatted).toMatchSnapshot();
}

test("formatZodError: formats primitive schema with primitive input", () => {
	testFormatZodError(z.number(), false);
});
test("formatZodError: formats primitive schema with object input", () => {
	testFormatZodError(z.string(), {
		a: 1,
		b: { c: 1 },
	});
});

test("formatZodError: formats object schema with primitive input", () => {
	testFormatZodError(z.object({ a: z.number() }), true);
});
test("formatZodError: formats object schema with object input", () => {
	testFormatZodError(
		z.object({
			a: z.string(),
			b: z.number(),
			c: z.boolean(),
			d: z.number(),
			e: z.number(),
			f: z.boolean(),
			g: z.boolean(),
		}),
		{
			a: "", // Check skips valid
			b: "2",
			c: true, // Check skips valid
			d: 4, // Check doesn't duplicate `...` when skipping valid
			e: 5,
			/*f*/ // Check required options
			g: "7",
		}
	);
});
test("formatZodError: formats object schema with additional options", () => {
	testFormatZodError(z.object({ a: z.number() }).strict(), { a: 1, b: 2 });
});

test("formatZodError: formats array schema with primitive input", () => {
	testFormatZodError(z.array(z.boolean()), 1);
});
test("formatZodError: formats array schema with array input", () => {
	testFormatZodError(z.array(z.number()), [
		1, // Check skips valid
		2, // Check doesn't duplicate `...` when skipping valid
		"3",
		4,
		5,
		false,
	]);
});
test("formatZodError: formats array schema with additional options", () => {
	testFormatZodError(z.array(z.number()).max(3), [1, 2, 3, 4, 5]);
});

test("formatZodError: formats deeply nested schema", () => {
	testFormatZodError(
		z.object({
			a: z.number(),
			b: z.object({
				c: z.string(),
				d: z.array(z.object({ e: z.boolean() })),
				f: z.array(z.number()),
			}),
			g: z.string(),
		}),
		{
			a: "1",
			b: {
				c: 2,
				d: [{ e: true }, { e: 42 }, false, {}],
				f: () => {},
			},
		}
	);
});

test("formatZodError: formats large actual values", () => {
	testFormatZodError(
		z.object({
			a: z.object({
				b: z.string(),
			}),
		}),
		{
			a: {
				// Check indents inspected value at correct depth
				b: Array.from({ length: 50 }).map((_, i) => i),
			},
		}
	);
});

test("formatZodError: formats union schema", () => {
	testFormatZodError(z.union([z.boolean(), z.literal(1)]), "a");
});

const discriminatedUnionSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("a"),
		a: z.number(),
	}),
	z.object({
		type: z.literal("b"),
		b: z.boolean(),
	}),
]);
test("formatZodError: formats discriminated union schema", () => {
	testFormatZodError(discriminatedUnionSchema, {
		type: "a",
		a: false,
	});
});
test("formatZodError: formats discriminated union schema with invalid discriminator", () => {
	testFormatZodError(discriminatedUnionSchema, { type: "c" });
});

test("formatZodError: formats intersection schema", () => {
	testFormatZodError(z.intersection(z.number(), z.literal(2)), false);
});

const objectUnionSchema = z.object({
	key: z.string(),
	objects: z.array(
		z.union([
			z.object({ a: z.number() }),
			z.object({ b: z.boolean() }),
			z.object({ c: z.string() }),
		])
	),
});
test("formatZodError: formats object union schema", () => {
	testFormatZodError(objectUnionSchema, {
		key: false,
		objects: [false, { a: 1 }, {}, [], { d: "" }],
	});
});
test("formatZodError: formats object union schema in colour", () => {
	testFormatZodError(
		objectUnionSchema,
		{
			key: false,
			objects: [false, {}, {}, {}, {}, {}, /* cycle */ {}, {}],
		},
		/* colour */ true
	);
});

test("formatZodError: formats tuple union schema", () => {
	testFormatZodError(
		z.object({
			tuples: z.array(
				z.union([
					z.tuple([z.string(), z.number()]),
					z.tuple([z.boolean(), z.boolean(), z.boolean()]),
				])
			),
		}),
		{
			tuples: [false, { a: 1 }, [], ["2", "3"], [4, 5, 6], [true, 7, false]],
		}
	);
});

test("formatZodError: formats custom message schema", () => {
	testFormatZodError(
		z.object({
			a: z.custom<never>(() => false, {
				message: "Custom message\nwith multiple\nlines",
			}),
		}),
		{ a: Symbol("kOoh") }
	);
});
