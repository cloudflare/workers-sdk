import assert from "node:assert";
import { _forceColour, formatZodError } from "@cloudflare/workers-utils";
import { describe, test } from "vitest";
import { z } from "zod";

function formatZodErrorForTest(
	schema: z.ZodType,
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
	test("formats primitive schema with primitive input", ({ expect }) => {
		const formatted = formatZodErrorForTest(z.number(), false);
		expect(formatted).toMatchInlineSnapshot(`
			"false
			^ Invalid input: expected number, received boolean"
		`);
	});
	test("formats primitive schema with object input", ({ expect }) => {
		const formatted = formatZodErrorForTest(z.string(), {
			a: 1,
			b: { c: 1 },
		});
		expect(formatted).toMatchInlineSnapshot(`
			"{ a: 1, b: [Object] }
			^ Invalid input: expected string, received object"
		`);
	});

	test("formats object schema with primitive input", ({ expect }) => {
		const formatted = formatZodErrorForTest(z.object({ a: z.number() }), true);
		expect(formatted).toMatchInlineSnapshot(`
			"true
			^ Invalid input: expected object, received boolean"
		`);
	});
	test("formats object schema with object input", ({ expect }) => {
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
			     ^ Invalid input: expected number, received string
			  ...,
			  g: '7',
			     ^ Invalid input: expected boolean, received string
			  f: undefined,
			     ^ Invalid input: expected boolean, received undefined
			}"
		`);
	});
	test("formats object schema with additional options", ({ expect }) => {
		const formatted = formatZodErrorForTest(
			z.object({ a: z.number() }).strict(),
			{ a: 1, b: 2 }
		);
		expect(formatted).toMatchInlineSnapshot(`
			"{ a: 1, b: 2 }
			^ Unrecognized key: "b""
		`);
	});

	test("formats array schema with primitive input", ({ expect }) => {
		const formatted = formatZodErrorForTest(z.array(z.boolean()), 1);
		expect(formatted).toMatchInlineSnapshot(`
			"1
			^ Invalid input: expected array, received number"
		`);
	});
	test("formats array schema with array input", ({ expect }) => {
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
			            ^ Invalid input: expected number, received string
			  ...,
			  /* [5] */ false,
			            ^ Invalid input: expected number, received boolean
			]"
		`);
	});
	test("formats array schema with additional options", ({ expect }) => {
		const formatted = formatZodErrorForTest(
			z.array(z.number()).max(3),
			[1, 2, 3, 4, 5]
		);
		expect(formatted).toMatchInlineSnapshot(`
			"[ 1, 2, 3, 4, 5 ]
			^ Too big: expected array to have <=3 items"
		`);
	});

	test("formats deeply nested schema", ({ expect }) => {
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
			     ^ Invalid input: expected number, received string
			  b: {
			    c: 2,
			       ^ Invalid input: expected string, received number
			    d: [
			      ...,
			      /* [1] */ {
			        e: 42,
			           ^ Invalid input: expected boolean, received number
			      },
			      /* [2] */ false,
			                ^ Invalid input: expected object, received boolean
			      /* [3] */ {
			        e: undefined,
			           ^ Invalid input: expected boolean, received undefined
			      },
			    ],
			    f: [Function: f],
			       ^ Invalid input: expected array, received function
			  },
			  g: undefined,
			     ^ Invalid input: expected string, received undefined
			}"
		`);
	});

	test("formats large actual values", ({ expect }) => {
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
			       ^ Invalid input: expected string, received array
			  },
			}"
		`);
	});

	test("formats union schema", ({ expect }) => {
		const formatted = formatZodErrorForTest(
			z.union([z.boolean(), z.literal(1)]),
			"a"
		);
		expect(formatted).toMatchInlineSnapshot(`
			"'a'
			^ Invalid input: expected boolean, received string
			  Invalid input: expected 1"
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
	test("formats discriminated union schema", ({ expect }) => {
		const formatted = formatZodErrorForTest(discriminatedUnionSchema, {
			type: "a",
			a: false,
		});
		expect(formatted).toMatchInlineSnapshot(`
			"{
			  ...,
			  a: false,
			     ^ Invalid input: expected number, received boolean
			}"
		`);
	});
	test("formats discriminated union schema with invalid discriminator", ({
		expect,
	}) => {
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

	test("formats intersection schema", ({ expect }) => {
		const formatted = formatZodErrorForTest(
			z.intersection(z.number(), z.literal(2)),
			false
		);
		expect(formatted).toMatchInlineSnapshot(`
			"false
			^ Invalid input: expected number, received boolean
			  Invalid input: expected 2"
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
	test("formats object union schema", ({ expect }) => {
		const formatted = formatZodErrorForTest(objectUnionSchema, {
			key: false,
			objects: [false, { a: 1 }, {}, [], { d: "" }],
		});
		expect(formatted).toMatchInlineSnapshot(`
			"{
			  key: false,
			       ^ Invalid input: expected string, received boolean
			  objects: [
			    /* [0] */ false,
			              ^ Invalid input: expected object, received boolean
			    ...,
			    /* [2] */ {
			      a: undefined,
			         ^1 Invalid input: expected number, received undefined *or*
			      b: undefined,
			         ^1 Invalid input: expected boolean, received undefined *or*
			      c: undefined,
			         ^1 Invalid input: expected string, received undefined
			    },
			    /* [3] */ [],
			              ^ Invalid input: expected object, received array
			    /* [4] */ {
			      ...,
			      a: undefined,
			         ^2 Invalid input: expected number, received undefined *or*
			      b: undefined,
			         ^2 Invalid input: expected boolean, received undefined *or*
			      c: undefined,
			         ^2 Invalid input: expected string, received undefined
			    },
			  ],
			}"
		`);
	});
	test("formats object union schema in colour", ({ expect }) => {
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
			[31m       ^ Invalid input: expected string, received boolean[39m
			  [2mobjects: [[22m
			    [2m/* [0] */ [22m[33mfalse[39m[2m,[22m
			[31m              ^ Invalid input: expected object, received boolean[39m
			    [2m/* [1] */ {[22m
			      [2ma: [22m[90mundefined[39m[2m,[22m
			[33m         ^1 Invalid input: expected number, received undefined *or*[39m
			      [2mb: [22m[90mundefined[39m[2m,[22m
			[33m         ^1 Invalid input: expected boolean, received undefined *or*[39m
			      [2mc: [22m[90mundefined[39m[2m,[22m
			[33m         ^1 Invalid input: expected string, received undefined[39m
			    [2m},[22m
			    [2m/* [2] */ {[22m
			      [2ma: [22m[90mundefined[39m[2m,[22m
			[36m         ^2 Invalid input: expected number, received undefined *or*[39m
			      [2mb: [22m[90mundefined[39m[2m,[22m
			[36m         ^2 Invalid input: expected boolean, received undefined *or*[39m
			      [2mc: [22m[90mundefined[39m[2m,[22m
			[36m         ^2 Invalid input: expected string, received undefined[39m
			    [2m},[22m
			    [2m/* [3] */ {[22m
			      [2ma: [22m[90mundefined[39m[2m,[22m
			[34m         ^3 Invalid input: expected number, received undefined *or*[39m
			      [2mb: [22m[90mundefined[39m[2m,[22m
			[34m         ^3 Invalid input: expected boolean, received undefined *or*[39m
			      [2mc: [22m[90mundefined[39m[2m,[22m
			[34m         ^3 Invalid input: expected string, received undefined[39m
			    [2m},[22m
			    [2m/* [4] */ {[22m
			      [2ma: [22m[90mundefined[39m[2m,[22m
			[35m         ^4 Invalid input: expected number, received undefined *or*[39m
			      [2mb: [22m[90mundefined[39m[2m,[22m
			[35m         ^4 Invalid input: expected boolean, received undefined *or*[39m
			      [2mc: [22m[90mundefined[39m[2m,[22m
			[35m         ^4 Invalid input: expected string, received undefined[39m
			    [2m},[22m
			    [2m/* [5] */ {[22m
			      [2ma: [22m[90mundefined[39m[2m,[22m
			[32m         ^5 Invalid input: expected number, received undefined *or*[39m
			      [2mb: [22m[90mundefined[39m[2m,[22m
			[32m         ^5 Invalid input: expected boolean, received undefined *or*[39m
			      [2mc: [22m[90mundefined[39m[2m,[22m
			[32m         ^5 Invalid input: expected string, received undefined[39m
			    [2m},[22m
			    [2m/* [6] */ {[22m
			      [2ma: [22m[90mundefined[39m[2m,[22m
			[33m         ^6 Invalid input: expected number, received undefined *or*[39m
			      [2mb: [22m[90mundefined[39m[2m,[22m
			[33m         ^6 Invalid input: expected boolean, received undefined *or*[39m
			      [2mc: [22m[90mundefined[39m[2m,[22m
			[33m         ^6 Invalid input: expected string, received undefined[39m
			    [2m},[22m
			    [2m/* [7] */ {[22m
			      [2ma: [22m[90mundefined[39m[2m,[22m
			[36m         ^7 Invalid input: expected number, received undefined *or*[39m
			      [2mb: [22m[90mundefined[39m[2m,[22m
			[36m         ^7 Invalid input: expected boolean, received undefined *or*[39m
			      [2mc: [22m[90mundefined[39m[2m,[22m
			[36m         ^7 Invalid input: expected string, received undefined[39m
			    [2m},[22m
			  [2m],[22m
			[2m}[22m"
		`);
	});

	test("formats tuple union schema", ({ expect }) => {
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
			              ^ Invalid input: expected tuple, received boolean
			    /* [1] */ { a: 1 },
			              ^ Invalid input: expected tuple, received object
			    /* [2] */ [],
			              ^ Too small: expected array to have >=2 items
			                Too small: expected array to have >=3 items
			    /* [3] */ [
			      ...,
			      /* [1] */ '3',
			                ^ Invalid input: expected number, received string
			    ],
			    /* [4] */ [
			      /* [0] */ 4,
			                ^1 Invalid input: expected string, received number
			                   Invalid input: expected boolean, received number *or*
			      /* [1] */ 5,
			                ^1 Invalid input: expected boolean, received number *or*
			      /* [2] */ 6,
			                ^1 Invalid input: expected boolean, received number
			    ],
			    /* [5] */ [
			      /* [0] */ true,
			                ^2 Invalid input: expected string, received boolean *or*
			      /* [1] */ 7,
			                ^2 Invalid input: expected boolean, received number
			      ...,
			    ],
			  ],
			}"
		`);
	});

	test("formats custom message schema", ({ expect }) => {
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
