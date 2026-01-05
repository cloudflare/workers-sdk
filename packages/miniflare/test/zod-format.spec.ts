import assert from "node:assert";
import { _forceColour, formatZodError } from "miniflare";
import { describe, expect, test } from "vitest";
import { z } from "zod";

function formatZodErrorForTest(
	schema: z.ZodTypeAny,
	input: unknown,
	colour?: boolean
) {
	const result = schema.safeParse(input);
	assert(!result.success);
	// Disable colours by default for easier-to-read snapshots
	_forceColour(colour ?? false);
	return formatZodError(result.error, input);
}

describe("formatZodError:", () => {
	test("formats primitive schema with primitive input", () => {
		const formatted = formatZodErrorForTest(z.number(), false);
		expect(formatted).toMatchInlineSnapshot(`
		"false
		^ Expected number, received boolean"
	`);
	});
	test("formats primitive schema with object input", () => {
		const formatted = formatZodErrorForTest(z.string(), {
			a: 1,
			b: { c: 1 },
		});
		expect(formatted).toMatchInlineSnapshot(`
		"{ a: 1, b: [Object] }
		^ Expected string, received object"
	`);
	});

	test("formats object schema with primitive input", () => {
		const formatted = formatZodErrorForTest(z.object({ a: z.number() }), true);
		expect(formatted).toMatchInlineSnapshot(`
		"true
		^ Expected object, received boolean"
	`);
	});
	test("formats object schema with object input", () => {
		const formatted = formatZodErrorForTest(
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
		expect(formatted).toMatchInlineSnapshot(`
		"{
		  ...,
		  b: '2',
		     ^ Expected number, received string
		  ...,
		  g: '7',
		     ^ Expected boolean, received string
		  f: undefined,
		     ^ Required
		}"
	`);
	});
	test("formats object schema with additional options", () => {
		const formatted = formatZodErrorForTest(
			z.object({ a: z.number() }).strict(),
			{ a: 1, b: 2 }
		);
		expect(formatted).toMatchInlineSnapshot(`
		"{ a: 1, b: 2 }
		^ Unrecognized key(s) in object: 'b'"
	`);
	});

	test("formats array schema with primitive input", () => {
		const formatted = formatZodErrorForTest(z.array(z.boolean()), 1);
		expect(formatted).toMatchInlineSnapshot(`
		"1
		^ Expected array, received number"
	`);
	});
	test("formats array schema with array input", () => {
		const formatted = formatZodErrorForTest(z.array(z.number()), [
			1, // Check skips valid
			2, // Check doesn't duplicate `...` when skipping valid
			"3",
			4,
			5,
			false,
		]);
		expect(formatted).toMatchInlineSnapshot(`
		"[
		  ...,
		  /* [2] */ '3',
		            ^ Expected number, received string
		  ...,
		  /* [5] */ false,
		            ^ Expected number, received boolean
		]"
	`);
	});
	test("formats array schema with additional options", () => {
		const formatted = formatZodErrorForTest(
			z.array(z.number()).max(3),
			[1, 2, 3, 4, 5]
		);
		expect(formatted).toMatchInlineSnapshot(`
		"[ 1, 2, 3, 4, 5 ]
		^ Array must contain at most 3 element(s)"
	`);
	});

	test("formats deeply nested schema", () => {
		const formatted = formatZodErrorForTest(
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
		expect(formatted).toMatchInlineSnapshot(`
		"{
		  a: '1',
		     ^ Expected number, received string
		  b: {
		    c: 2,
		       ^ Expected string, received number
		    d: [
		      ...,
		      /* [1] */ {
		        e: 42,
		           ^ Expected boolean, received number
		      },
		      /* [2] */ false,
		                ^ Expected object, received boolean
		      /* [3] */ {
		        e: undefined,
		           ^ Required
		      },
		    ],
		    f: [Function: f],
		       ^ Expected array, received function
		  },
		  g: undefined,
		     ^ Required
		}"
	`);
	});

	test("formats large actual values", () => {
		const formatted = formatZodErrorForTest(
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
		expect(formatted).toMatchInlineSnapshot(`
		"{
		  a: {
		    b: [
		          0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10,
		         11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
		         22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
		         33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
		         44, 45, 46, 47, 48, 49
		       ],
		       ^ Expected string, received array
		  },
		}"
	`);
	});

	test("formats union schema", () => {
		const formatted = formatZodErrorForTest(
			z.union([z.boolean(), z.literal(1)]),
			"a"
		);
		expect(formatted).toMatchInlineSnapshot(`
		"'a'
		^ Expected boolean, received string
		  Invalid literal value, expected 1"
	`);
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
	test("formats discriminated union schema", () => {
		const formatted = formatZodErrorForTest(discriminatedUnionSchema, {
			type: "a",
			a: false,
		});
		expect(formatted).toMatchInlineSnapshot(`
		"{
		  ...,
		  a: false,
		     ^ Expected number, received boolean
		}"
	`);
	});
	test("formats discriminated union schema with invalid discriminator", () => {
		const formatted = formatZodErrorForTest(discriminatedUnionSchema, {
			type: "c",
		});
		expect(formatted).toMatchInlineSnapshot(`
		"{
		  type: 'c',
		        ^ Invalid discriminator value. Expected 'a' | 'b'
		}"
	`);
	});

	test("formats intersection schema", () => {
		const formatted = formatZodErrorForTest(
			z.intersection(z.number(), z.literal(2)),
			false
		);
		expect(formatted).toMatchInlineSnapshot(`
		"false
		^ Expected number, received boolean
		  Invalid literal value, expected 2"
	`);
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
	test("formats object union schema", () => {
		const formatted = formatZodErrorForTest(objectUnionSchema, {
			key: false,
			objects: [false, { a: 1 }, {}, [], { d: "" }],
		});
		expect(formatted).toMatchInlineSnapshot(`
		"{
		  key: false,
		       ^ Expected string, received boolean
		  objects: [
		    /* [0] */ false,
		              ^ Expected object, received boolean
		    ...,
		    /* [2] */ {
		      a: undefined,
		         ^1 Required *or*
		      b: undefined,
		         ^1 Required *or*
		      c: undefined,
		         ^1 Required
		    },
		    /* [3] */ [],
		              ^ Expected object, received array
		    /* [4] */ {
		      ...,
		      a: undefined,
		         ^2 Required *or*
		      b: undefined,
		         ^2 Required *or*
		      c: undefined,
		         ^2 Required
		    },
		  ],
		}"
	`);
	});
	test("formats object union schema in colour", () => {
		const formatted = formatZodErrorForTest(
			objectUnionSchema,
			{
				key: false,
				objects: [false, {}, {}, {}, {}, {}, /* cycle */ {}, {}],
			},
			/* colour */ true
		);
		expect(formatted).toMatchInlineSnapshot(`
		"[2m{[22m
		  [2mkey: [22m[33mfalse[39m[2m,[22m
		[31m       ^ Expected string, received boolean[39m
		  [2mobjects: [[22m
		    [2m/* [0] */ [22m[33mfalse[39m[2m,[22m
		[31m              ^ Expected object, received boolean[39m
		    [2m/* [1] */ {[22m
		      [2ma: [22m[90mundefined[39m[2m,[22m
		[33m         ^1 Required *or*[39m
		      [2mb: [22m[90mundefined[39m[2m,[22m
		[33m         ^1 Required *or*[39m
		      [2mc: [22m[90mundefined[39m[2m,[22m
		[33m         ^1 Required[39m
		    [2m},[22m
		    [2m/* [2] */ {[22m
		      [2ma: [22m[90mundefined[39m[2m,[22m
		[36m         ^2 Required *or*[39m
		      [2mb: [22m[90mundefined[39m[2m,[22m
		[36m         ^2 Required *or*[39m
		      [2mc: [22m[90mundefined[39m[2m,[22m
		[36m         ^2 Required[39m
		    [2m},[22m
		    [2m/* [3] */ {[22m
		      [2ma: [22m[90mundefined[39m[2m,[22m
		[34m         ^3 Required *or*[39m
		      [2mb: [22m[90mundefined[39m[2m,[22m
		[34m         ^3 Required *or*[39m
		      [2mc: [22m[90mundefined[39m[2m,[22m
		[34m         ^3 Required[39m
		    [2m},[22m
		    [2m/* [4] */ {[22m
		      [2ma: [22m[90mundefined[39m[2m,[22m
		[35m         ^4 Required *or*[39m
		      [2mb: [22m[90mundefined[39m[2m,[22m
		[35m         ^4 Required *or*[39m
		      [2mc: [22m[90mundefined[39m[2m,[22m
		[35m         ^4 Required[39m
		    [2m},[22m
		    [2m/* [5] */ {[22m
		      [2ma: [22m[90mundefined[39m[2m,[22m
		[32m         ^5 Required *or*[39m
		      [2mb: [22m[90mundefined[39m[2m,[22m
		[32m         ^5 Required *or*[39m
		      [2mc: [22m[90mundefined[39m[2m,[22m
		[32m         ^5 Required[39m
		    [2m},[22m
		    [2m/* [6] */ {[22m
		      [2ma: [22m[90mundefined[39m[2m,[22m
		[33m         ^6 Required *or*[39m
		      [2mb: [22m[90mundefined[39m[2m,[22m
		[33m         ^6 Required *or*[39m
		      [2mc: [22m[90mundefined[39m[2m,[22m
		[33m         ^6 Required[39m
		    [2m},[22m
		    [2m/* [7] */ {[22m
		      [2ma: [22m[90mundefined[39m[2m,[22m
		[36m         ^7 Required *or*[39m
		      [2mb: [22m[90mundefined[39m[2m,[22m
		[36m         ^7 Required *or*[39m
		      [2mc: [22m[90mundefined[39m[2m,[22m
		[36m         ^7 Required[39m
		    [2m},[22m
		  [2m],[22m
		[2m}[22m"
	`);
	});

	test("formats tuple union schema", () => {
		const formatted = formatZodErrorForTest(
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
		expect(formatted).toMatchInlineSnapshot(`
		"{
		  tuples: [
		    /* [0] */ false,
		              ^ Expected array, received boolean
		    /* [1] */ { a: 1 },
		              ^ Expected array, received object
		    /* [2] */ [],
		              ^ Array must contain at least 2 element(s)
		                Array must contain at least 3 element(s)
		    /* [3] */ [
		      ...,
		      /* [1] */ '3',
		                ^ Expected number, received string
		    ],
		    /* [4] */ [
		      /* [0] */ 4,
		                ^1 Expected string, received number
		                   Expected boolean, received number *or*
		      /* [1] */ 5,
		                ^1 Expected boolean, received number *or*
		      /* [2] */ 6,
		                ^1 Expected boolean, received number
		    ],
		    /* [5] */ [
		      /* [0] */ true,
		                ^2 Expected string, received boolean *or*
		      /* [1] */ 7,
		                ^2 Expected boolean, received number
		      ...,
		    ],
		  ],
		}"
	`);
	});

	test("formats custom message schema", () => {
		const formatted = formatZodErrorForTest(
			z.object({
				a: z.custom<never>(() => false, {
					message: "Custom message\nwith multiple\nlines",
				}),
			}),
			{ a: Symbol("kOoh") }
		);
		expect(formatted).toMatchInlineSnapshot(`
		"{
		  a: Symbol(kOoh),
		     ^ Custom message
		       with multiple
		       lines
		}"
	`);
	});
});
