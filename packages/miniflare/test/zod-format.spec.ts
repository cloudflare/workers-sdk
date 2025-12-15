import assert from "node:assert";
import test from "ava";
import { _forceColour, formatZodError } from "miniflare";
import { z } from "zod";

const formatZodErrorMacro = test.macro({
	title(providedTitle) {
		return `formatZodError: formats ${providedTitle}`;
	},
	exec(t, schema: z.ZodTypeAny, input: unknown, colour?: boolean) {
		const result = schema.safeParse(input);
		assert(!result.success);
		// Disable colours by default for easier-to-read snapshots
		_forceColour(colour ?? false);
		const formatted = formatZodError(result.error, input);
		t.snapshot(formatted);
	},
});

test(
	"primitive schema with primitive input",
	formatZodErrorMacro,
	z.number(),
	false
);
test("primitive schema with object input", formatZodErrorMacro, z.string(), {
	a: 1,
	b: { c: 1 },
});

test(
	"object schema with primitive input",
	formatZodErrorMacro,
	z.object({ a: z.number() }),
	true
);
test(
	"object schema with object input",
	formatZodErrorMacro,
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
test(
	"object schema with additional options",
	formatZodErrorMacro,
	z.object({ a: z.number() }).strict(),
	{ a: 1, b: 2 }
);

test(
	"array schema with primitive input",
	formatZodErrorMacro,
	z.array(z.boolean()),
	1
);
test(
	"array schema with array input",
	formatZodErrorMacro,
	z.array(z.number()),
	[
		1, // Check skips valid
		2, // Check doesn't duplicate `...` when skipping valid
		"3",
		4,
		5,
		false,
	]
);
test(
	"array schema with additional options",
	formatZodErrorMacro,
	z.array(z.number()).max(3),
	[1, 2, 3, 4, 5]
);

test(
	"deeply nested schema",
	formatZodErrorMacro,
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

test(
	"large actual values",
	formatZodErrorMacro,
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

test(
	"union schema",
	formatZodErrorMacro,
	z.union([z.boolean(), z.literal(1)]),
	"a"
);

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
test(
	"discriminated union schema",
	formatZodErrorMacro,
	discriminatedUnionSchema,
	{
		type: "a",
		a: false,
	}
);
test(
	"discriminated union schema with invalid discriminator",
	formatZodErrorMacro,
	discriminatedUnionSchema,
	{ type: "c" }
);

test(
	"intersection schema",
	formatZodErrorMacro,
	z.intersection(z.number(), z.literal(2)),
	false
);

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
test("object union schema", formatZodErrorMacro, objectUnionSchema, {
	key: false,
	objects: [false, { a: 1 }, {}, [], { d: "" }],
});
test(
	"object union schema in colour",
	formatZodErrorMacro,
	objectUnionSchema,
	{
		key: false,
		objects: [false, {}, {}, {}, {}, {}, /* cycle */ {}, {}],
	},
	/* colour */ true
);

test(
	"tuple union schema",
	formatZodErrorMacro,
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

test(
	"custom message schema",
	formatZodErrorMacro,
	z.object({
		a: z.custom<never>(() => false, {
			message: "Custom message\nwith multiple\nlines",
		}),
	}),
	{ a: Symbol("kOoh") }
);
