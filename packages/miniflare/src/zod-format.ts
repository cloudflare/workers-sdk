// TODO(someday): publish this as a separate package
// noinspection JSUnusedAssignment
// ^ WebStorm incorrectly thinks some variables might not have been initialised
//   before use without this. TypeScript is better at catching these errors. :)

import assert from "node:assert";
import util from "node:util";
import {
	$ as $colors,
	blue,
	cyan,
	dim,
	green,
	magenta,
	red,
	yellow,
} from "kleur/colors";
import type * as z from "zod/v4";

// This file contains a `formatZodError(error, input)` function for formatting
// a Zod `error` that came from parsing a specific `input`. This works by
// building an "annotated" version of the `input`, with roughly the same shape,
// but including messages from the `error`. This is then printed to a string.
//
// When the Zod `error` includes an issue at a specific path, that path is
// replaced with an `Annotation` in the "annotated" version. This `Annotation`,
// includes any messages for that path, along with the actual value at that
// path. `Annotation`s may be grouped if they are part of a union. In this case,
// they'll be printed in a different colour and with a group ID to indicate that
// only one of the issues needs to be fixed for all issues in the group to be
// resolved.
//
// This is best illustrated with some examples:
//
// # Primitive Input
//
// ```
// const schema = z.boolean();
// const input = 42;
// const error = schema.safeParse(input).error;
//       ↳ ZodError [
//           {
//             "code": "invalid_type",
//             "expected": "boolean",
//             "received": "number",
//             "path": [],
//             "message": "Expected boolean, received number"
//           }
//         ]
//
// /* Annotated */
// {
//   [Symbol(kMessages)]: [ 'Expected boolean, received number' ],
//   [Symbol(kActual)]: 42
// }
//
// const formatted = formatZodError(error, input);
//       ↳ 42
//         ^ Expected boolean, received number
// ```
//
// In this example, we only have a single issue, with `"path": []`. This path
// represents the root, so the root of the input has been replaced with an
// annotation in the annotated version.
//
// ### Object Input
//
// ````
// const schema = z.object({ a: z.number(), b: z.number(), c: z.object({ d: z.number() })});
// const input = { a: false, b: 42, c: { d: "not a number" } };
// const error = schema.safeParse(input).error;
//       ↳ ZodError: [
//           {
//             "code": "invalid_type",
//             "expected": "number",
//             "received": "boolean",
//             "path": [ "a" ],
//             "message": "Expected number, received boolean"
//           },
//           {
//             "code": "invalid_type",
//             "expected": "number",
//             "received": "string",
//             "path": [ "c", "d" ],
//             "message": "Expected number, received boolean"
//           }
//         ]
//
// /* Annotated after 1st issue */
// {
//   a: {
//     [Symbol(kMessages)]: [ 'Expected number, received boolean' ],
//     [Symbol(kActual)]: false
//   },
//   b: undefined,
//   c: undefined,
// }
//
// /* Annotated after 2nd issue */
// {
//   a: {
//     [Symbol(kMessages)]: [ 'Expected number, received boolean' ],
//     [Symbol(kActual)]: false
//   },
//   b: undefined,
//   c: {
//     d: {
//       [Symbol(kMessages)]: [ 'Expected number, received string' ],
//       [Symbol(kActual)]: 'not a number'
//     }
//   }
// }
//
// const formatted = formatZodError(error, input);
//       ↳ {
//           a: false,
//              ^ Expected number, received boolean
//           ...,
//           c: {
//             d: true,
//                ^ Expected number, received boolean
//           },
//         }
// ````
//
// If the error contains multiple issues, we annotate them one at a time.
// For object inputs, the annotated object starts out with the same keys as
// the object, just with `undefined` values. Keys with values that are
// `undefined` at the end of annotation will be printed as "...". Annotations
// are inserted on paths where there are issues. Note annotations are
// effectively the leaves of the annotated tree.
//
// ### Array Input
//
// ```
// const schema = z.array(z.number());
// const input = [1, 2, false, 4];
// const error = schema.safeParse(input).error;
//       ↳ ZodError: [
//            {
//              "code": "invalid_type",
//              "expected": "number",
//              "received": "boolean",
//              "path": [ 2 ],
//              "message": "Expected number, received boolean"
//            }
//          ]
//
// /* Annotated */
// [
//   <2 empty items>,
//   {
//     [Symbol(kMessages)]: [ 'Expected number, received boolean' ],
//     [Symbol(kActual)]: false
//   },
//   <1 empty item>
// ]
//
// const formatted = formatZodError(error, input);
//       ↳ [
//           ...,
//           /* [2] */ false,
//                     ^ Expected number, received boolean
//           ...,
//         ]
// ```
//
// In this case the annotated value is now an array, rather than a plain-object,
// to match the shape of the input. Note it has the same length as the input,
// including empty items for array indices that don't have errors. Empty items
// will be coalesced and printed as "...".
//
// ### Union Schema and Groups
//
// ```
// const schema = z.union([z.object({ a: z.number() }), z.object({ b: z.string() })]);
// const input = { c: false };
// const error = schema.safeParse(input).error;
//       ↳ [
//           {
//             "code": "invalid_union",
//             "path": [],
//             "message": "Invalid input",
//             "unionErrors": [
//               {
//                 "name": "ZodError",
//                 "issues": [
//                   {
//                     "code": "invalid_type",
//                     "expected": "number",
//                     "received": "undefined",
//                     "path": [ "a" ],
//                     "message": "Required"
//                   }
//                 ]
//               },
//               {
//                 "name": "ZodError",
//                 "issues": [
//                   {
//                     "code": "invalid_type",
//                     "expected": "string",
//                     "received": "undefined",
//                     "path": [ "b" ],
//                     "message": "Required"
//                   }
//                 ]
//               }
//             ]
//           }
//         ]
//
// /* Annotated */
// {
//   c: undefined,
//   a: {
//     [Symbol(kMessages)]: [ 'Required' ],
//     [Symbol(kActual)]: undefined,
//     [Symbol(kGroupId)]: 0
//   },
//   b: {
//     [Symbol(kMessages)]: [ 'Required' ],
//     [Symbol(kActual)]: undefined,
//     [Symbol(kGroupId)]: 0
//   }
// }
//
// const formatted = formatZodError(error, input);
//       ↳ {
//           ...,
//           a: undefined,
//              ^1 Required *or*
//           b: undefined,
//              ^1 Required
//         }
// ```
//
// In this case, fixing either of the reported issues would solve the problem.
// To indicate this, we "group" issues contained within `unionErrors`. See how
// annotations have a `[Symbol(kGroupId)]: 0`. Group IDs are 0-indexed
// internally but 1-indexed when displayed (see "^1"). Each group's messages
// are displayed in a different colour to visually group them. Note the
// unhelpful "Invalid input" message has been hidden. Required options that
// are not present in the `input` are added to the end of the annotated input.
//

const kMessages = Symbol("kMessages");
const kActual = Symbol("kActual");
const kGroupId = Symbol("kGroupId");

// Set of Zod error messages attached to a specific path in the input
interface Annotation {
	// Error messages at this specific path in the annotated tree. A path may have
	// multiple messages associated with it if the schema is a union/intersection.
	[kMessages]: string[];
	// The input value at this specific path
	[kActual]: unknown;
	// Optional 0-indexed group for this annotation. Fixing a single issue in a
	// group will usually fix all other issues in the group. Grouped annotations
	// are displayed in a different colour with their 1-indexed group ID.
	[kGroupId]?: number;
}

// Object with the same shape as the input, but with undefined at the leaves,
// or an annotation iff there's an issue at that specific path.
type Annotated =
	| undefined
	| Annotation
	| { [key: string]: Annotated }
	| Annotated[];

// `green` is a success colour, so only use it for groups if really needed
const groupColours = [yellow, /* (green) */ cyan, blue, magenta, green];

// Maps group IDs to the number of annotations in that group. Used to determine
// whether this isn't the last annotation in a group, and "or" should be printed
// with the message.
const GroupCountsMap = Map<number /* [kGroupId] */, number /* count */>;
type GroupCountsMap = InstanceType<typeof GroupCountsMap>;

function isAnnotation(value: unknown): value is Annotation {
	return (
		typeof value === "object" &&
		value !== null &&
		kMessages in value &&
		kActual in value
	);
}

function isRecord(value: unknown): value is Record<string | number, unknown> {
	return typeof value === "object" && value !== null;
}

function arrayShallowEqual<T>(a: T[], b: T[]) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

function issueEqual(a: z.ZodIssue, b: z.ZodIssue) {
	// We consider issues to be equal if their messages and paths are
	return a.message === b.message && arrayShallowEqual(a.path, b.path);
}

function hasMultipleDistinctMessages(issues: z.ZodIssue[], atDepth: number) {
	// Returns true iff `issues` has issues that aren't "the same" at the
	// specified depth or below
	let firstIssue: z.ZodIssue | undefined;
	for (const issue of issues) {
		if (issue.path.length < atDepth) continue;
		if (firstIssue === undefined) firstIssue = issue;
		else if (!issueEqual(firstIssue, issue)) return true;
	}
	return false;
}

function annotate(
	groupCounts: GroupCountsMap,
	annotated: Annotated,
	input: unknown,
	issue: z.core.$ZodIssue,
	path: (string | number)[],
	groupId?: number
): Annotated {
	if (path.length === 0) {
		// Empty path, `input` has incorrect shape

		// If this is an `invalid_union` error, make sure we include all sub-issues
		if (issue.code === "invalid_union") {
			const unionIssues = issue.errors.flat();

			// If the `input` is an object/array with multiple distinct messages,
			// annotate it as a group
			let newGroupId: number | undefined;
			const multipleDistinct = hasMultipleDistinctMessages(
				unionIssues,
				// For this check, we only include messages that are deeper than our
				// current level, so we don't include messages we'd ignore if we grouped
				issue.path.length + 1
			);
			if (isRecord(input) && multipleDistinct) {
				newGroupId = groupCounts.size;
				groupCounts.set(newGroupId, 0);
			}

			for (const unionIssue of unionIssues) {
				const unionPath = unionIssue.path
					.slice(issue.path.length)
					.filter((e) => typeof e !== "symbol");
				// If we have multiple distinct messages at deeper levels, and this
				// issue is for the current path, skip it, so we don't end up annotating
				// the current path and sub-paths
				if (multipleDistinct && unionPath.length === 0) continue;
				annotated = annotate(
					groupCounts,
					annotated,
					input,
					unionIssue,
					unionPath,
					newGroupId
				);
			}
			return annotated;
		}

		const message = issue.message;
		// If we've already annotated this path (existing annotation or union)...
		if (annotated !== undefined) {
			// ...and if this is a new message for an existing annotation...
			if (isAnnotation(annotated) && !annotated[kMessages].includes(message)) {
				// ...add it
				annotated[kMessages].push(message);
			}
			return annotated;
		}

		// Creating a new annotation

		// If this new annotation is part of a group...
		if (groupId !== undefined) {
			// ...increment that group's count
			const current = groupCounts.get(groupId);
			assert(current !== undefined);
			groupCounts.set(groupId, current + 1);
		}

		return <Annotation>{
			[kMessages]: [message],
			[kActual]: input,
			[kGroupId]: groupId,
		};
	}

	// Non-empty path, `input` should be an object or array
	const [head, ...tail] = path;
	assert(isRecord(input), "Expected object/array input for nested issue");
	if (annotated === undefined) {
		// Initialise `annotated` to look like `input`, with empty slots for keys
		if (Array.isArray(input)) {
			annotated = new Array(input.length);
		} else {
			const entries = Object.keys(input).map((key) => [key, undefined]);
			annotated = Object.fromEntries(entries);
		}
	}
	assert(isRecord(annotated), "Expected object/array for nested issue");
	// Recursively annotate
	annotated[head] = annotate(
		groupCounts,
		annotated[head],
		input[head],
		issue,
		tail,
		groupId
	);
	return annotated;
}

interface PrintExtras {
	prefix?: string;
	suffix?: string;
}
function print(
	inspectOptions: util.InspectOptions,
	groupCounts: GroupCountsMap,
	annotated: Annotated,
	indent = "",
	extras?: PrintExtras
): string {
	const prefix = extras?.prefix ?? "";
	const suffix = extras?.suffix ?? "";

	if (isAnnotation(annotated)) {
		const prefixIndent = indent + " ".repeat(prefix.length);

		// Print actual value
		const actual = util.inspect(annotated[kActual], inspectOptions);
		const actualIndented = actual
			.split("\n")
			.map((line, i) => (i > 0 ? prefixIndent + line : line))
			.join("\n");

		// Print message
		let messageColour = red;
		let messagePrefix = prefixIndent + "^";
		let groupOr = "";
		if (annotated[kGroupId] !== undefined) {
			// If this annotation was part of a group, set the message colour based
			// on the group, and include the group ID in the prefix
			messageColour = groupColours[annotated[kGroupId] % groupColours.length];
			messagePrefix += annotated[kGroupId] + 1;
			const remaining = groupCounts.get(annotated[kGroupId]);
			assert(remaining !== undefined);
			if (remaining > 1) groupOr = " *or*";
			groupCounts.set(annotated[kGroupId], remaining - 1);
		}
		messagePrefix += " ";

		const messageIndent = " ".repeat(messagePrefix.length);
		const messageIndented = annotated[kMessages]
			.flatMap((m) => m.split("\n"))
			.map((line, i) => (i > 0 ? messageIndent + line : line))
			.join("\n");

		// Print final annotation
		const error = messageColour(`${messagePrefix}${messageIndented}${groupOr}`);
		return `${indent}${dim(prefix)}${actualIndented}${dim(suffix)}\n${error}`;
	} else if (Array.isArray(annotated)) {
		// Print array recursively
		let result = `${indent}${dim(`${prefix}[`)}\n`;
		const arrayIndent = indent + "  ";
		for (let i = 0; i < annotated.length; i++) {
			const value = annotated[i];
			// Add `...` if the last item wasn't an `...`
			if (value === undefined && (i === 0 || annotated[i - 1] !== undefined)) {
				result += `${arrayIndent}${dim("...,")}\n`;
			}
			if (value !== undefined) {
				result += print(inspectOptions, groupCounts, value, arrayIndent, {
					prefix: `/* [${i}] */ `,
					suffix: ",",
				});
				result += "\n";
			}
		}
		result += `${indent}${dim(`]${suffix}`)}`;
		return result;
	} else if (isRecord(annotated)) {
		// Print object recursively
		let result = `${indent}${dim(`${prefix}{`)}\n`;
		const objectIndent = indent + "  ";
		const entries = Object.entries(annotated);
		for (let i = 0; i < entries.length; i++) {
			const [key, value] = entries[i];
			// Add `...` if the last item wasn't an `...`
			if (value === undefined && (i === 0 || entries[i - 1][1] !== undefined)) {
				result += `${objectIndent}${dim("...,")}\n`;
			}
			if (value !== undefined) {
				result += print(inspectOptions, groupCounts, value, objectIndent, {
					prefix: `${key}: `,
					suffix: ",",
				});
				result += "\n";
			}
		}
		result += `${indent}${dim(`}${suffix}`)}`;
		return result;
	}

	return "";
}

export function formatZodError(
	error: z.core.$ZodError,
	input: unknown
): string {
	// Shallow copy and sort array, with `invalid_union` errors first, so we don't
	// annotate the input with an `invalid_type` error instead
	const sortedIssues = Array.from(error.issues).sort((a, b) => {
		if (a.code !== b.code) {
			if (a.code === "invalid_union") return -1;
			if (b.code === "invalid_union") return 1;
		}
		return 0;
	});

	// Build annotated input
	let annotated: Annotated;
	const groupCounts = new GroupCountsMap();
	for (const issue of sortedIssues) {
		annotated = annotate(
			groupCounts,
			annotated,
			input,
			issue,
			issue.path.filter((e) => typeof e !== "symbol")
		);
	}

	// Print to pretty string
	// Build inspect options on each call to `formatZodError()` so we can toggle
	// colours per-call
	const inspectOptions: util.InspectOptions = {
		depth: 0,
		colors: $colors.enabled,
	};
	return print(inspectOptions, groupCounts, annotated);
}
