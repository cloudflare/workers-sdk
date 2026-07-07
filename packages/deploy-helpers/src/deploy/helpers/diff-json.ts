import chalk from "chalk";
import { create } from "jsondiffpatch";

export type JsonLike =
	| string
	| number
	| boolean
	| null
	| JsonLike[]
	| undefined // undefined is not a JSON type but it needs to be included here since it is present in the diff objects
	| { [id: string]: JsonLike };

// Positional (not identity-based) array diffing keeps the diff semantics aligned
// with how binding arrays are pre-ordered by the config normalizer, and lets
// aligned object elements be reported as in-place modifications rather than a
// remove + add pair. Text diffing is left disabled (no `diffMatchPatch` filter)
// so strings are always compared as whole values.
const differ = create({
	arrays: { detectMove: false, includeValueOnMove: false },
});

/**
 * Given two objects A and B that are Json serializable this function computes the difference between them
 *
 * The difference object includes:
 *  - fields in object B but not in object A included as `<fieldKey__added>`
 *  - fields in object A but not in object B included as `<fieldKey__deleted>`
 *  - fields present in both objects but modified as `<fieldKey>: { __old: <objectAValue>, __new: <objectBValue> }`
 *
 * Additionally the difference object contains a `toString` method that can be used to generate a string representation
 * of the difference between the two objects (to be presented to users)
 *
 * @param jsonObjA The first target object
 * @param jsonObjB The second target object
 * @returns An object representing the diff between the two objects, or null if the objects are equal
 */
export function diffJsonObjects(
	jsonObjA: Record<string, JsonLike>,
	jsonObjB: Record<string, JsonLike>
): Record<string, JsonLike> | null {
	const delta = differ.diff(jsonObjA, jsonObjB);

	if (delta === undefined) {
		return null;
	}

	const result = objectDeltaToLegacy(delta, jsonObjB);

	// Attach a lazy, human-readable representation used when the diff is logged to the user.
	// It is defined as a non-enumerable property so it never shows up while the structured
	// diff is walked by `isNonDestructive` / `getConfigPatch`.
	Object.defineProperty(result, "toString", {
		value: () => formatDiffString(result),
		enumerable: false,
	});

	return result;
}

/**
 * Converts a jsondiffpatch delta into the legacy `json-diff` structured format that the rest of the
 * config-diffing helpers (`isNonDestructive`, `isModifiedDiffValue`, `getConfigPatch`) consume.
 *
 * jsondiffpatch encodes changes as arrays: `[value]` = added, `[old, new]` = modified,
 * `[old, 0, 0]` = deleted; nested objects/arrays are recursed into (arrays are tagged with `_t: "a"`
 * and only include changed indices). The local (right-hand-side) value is threaded through purely to
 * recover array lengths, since unchanged array elements are omitted from the delta but the legacy
 * format (and the positional patch it drives) needs a placeholder for each surviving element.
 */
function deltaToLegacy(
	delta: object,
	local: JsonLike
): Record<string, JsonLike> | JsonLike[] {
	if ((delta as { _t?: unknown })._t === "a") {
		return arrayDeltaToLegacy(delta as Record<string, unknown>, local);
	}
	return objectDeltaToLegacy(delta, local);
}

function objectDeltaToLegacy(
	delta: object,
	local: JsonLike
): Record<string, JsonLike> {
	const out: Record<string, JsonLike> = {};
	for (const [key, value] of Object.entries(delta)) {
		if (key === "_t") {
			continue;
		}
		if (Array.isArray(value)) {
			if (value.length === 1) {
				out[`${key}__added`] = value[0] as JsonLike;
			} else if (value.length === 2) {
				out[key] = {
					__old: value[0] as JsonLike,
					__new: value[1] as JsonLike,
				};
			} else {
				// `[old, 0, 0]` => deleted key
				out[`${key}__deleted`] = value[0] as JsonLike;
			}
		} else if (value !== null && typeof value === "object") {
			out[key] = deltaToLegacy(value, getChild(local, key));
		}
	}
	return out;
}

function arrayDeltaToLegacy(
	delta: Record<string, unknown>,
	local: JsonLike
): JsonLike[] {
	const localArr = Array.isArray(local) ? local : [];
	const result: JsonLike[] = [];

	// Emit surviving (unchanged / added / modified) elements in local order so that
	// positional indices in the resulting patch line up with the local config array.
	for (let index = 0; index < localArr.length; index++) {
		const value = delta[String(index)];
		if (value === undefined) {
			result.push([" "]);
		} else if (Array.isArray(value)) {
			if (value.length === 1) {
				result.push(["+", value[0] as JsonLike]);
			} else if (value.length === 2) {
				result.push([
					"~",
					{ __old: value[0] as JsonLike, __new: value[1] as JsonLike },
				]);
			} else {
				result.push([" "]);
			}
		} else if (value !== null && typeof value === "object") {
			result.push(["~", deltaToLegacy(value, localArr[index])]);
		}
	}

	// Removed elements are keyed by their original index with an underscore prefix
	// (`_<index>: [old, 0, 0]`); they are appended so the patch can restore them.
	for (const [key, value] of Object.entries(delta)) {
		if (key === "_t" || !key.startsWith("_")) {
			continue;
		}
		result.push(["-", (Array.isArray(value) ? value[0] : value) as JsonLike]);
	}

	return result;
}

function getChild(local: JsonLike, key: string): JsonLike {
	if (local !== null && typeof local === "object" && !Array.isArray(local)) {
		return local[key];
	}
	return undefined;
}

const ADDED_SUFFIX = "__added";
const DELETED_SUFFIX = "__deleted";
const INDENT = "  ";

/**
 * Renders a diff object (as produced by `diffJsonObjects`) into a compact, git-style,
 * changed-only string for display to the user. Each line is prefixed with a marker:
 * ` ` for surrounding context, `-` (red) for removed/old values and `+` (green) for
 * added/new values. Unchanged siblings and array elements are omitted.
 */
function formatDiffString(diff: Record<string, JsonLike>): string {
	const lines: string[] = [];
	lines.push(marker(" ", 0, "{"));
	for (const [key, value] of Object.entries(diff)) {
		renderKey(lines, key, value, 1);
	}
	lines.push(marker(" ", 0, "}"));
	return `${lines.join("\n")}\n`;
}

function marker(sign: " " | "+" | "-", depth: number, content: string): string {
	const text = sign + INDENT.repeat(depth) + content;
	if (sign === "-") {
		return chalk.red(text);
	}
	if (sign === "+") {
		return chalk.green(text);
	}
	return text;
}

function renderKey(
	lines: string[],
	key: string,
	value: JsonLike,
	depth: number
): void {
	if (key.endsWith(ADDED_SUFFIX)) {
		renderValueWithSign(
			lines,
			"+",
			key.slice(0, -ADDED_SUFFIX.length),
			value,
			depth
		);
		return;
	}
	if (key.endsWith(DELETED_SUFFIX)) {
		renderValueWithSign(
			lines,
			"-",
			key.slice(0, -DELETED_SUFFIX.length),
			value,
			depth
		);
		return;
	}
	if (isModifiedDiffValue(value)) {
		renderValueWithSign(lines, "-", key, value.__old, depth);
		renderValueWithSign(lines, "+", key, value.__new, depth);
		return;
	}
	if (Array.isArray(value)) {
		lines.push(marker(" ", depth, `${key}: [`));
		renderArrayDiff(lines, value, depth + 1);
		lines.push(marker(" ", depth, "]"));
		return;
	}
	if (value !== null && typeof value === "object") {
		lines.push(marker(" ", depth, `${key}: {`));
		for (const [nestedKey, nestedValue] of Object.entries(value)) {
			renderKey(lines, nestedKey, nestedValue, depth + 1);
		}
		lines.push(marker(" ", depth, "}"));
	}
}

function renderArrayDiff(
	lines: string[],
	elements: JsonLike[],
	depth: number
): void {
	for (const element of elements) {
		if (!Array.isArray(element)) {
			continue;
		}
		const [sign, value] = element;
		if (sign === "+") {
			renderValueLines(value).forEach((l) => lines.push(marker("+", depth, l)));
		} else if (sign === "-") {
			renderValueLines(value).forEach((l) => lines.push(marker("-", depth, l)));
		} else if (sign === "~") {
			if (Array.isArray(value)) {
				lines.push(marker(" ", depth, "["));
				renderArrayDiff(lines, value, depth + 1);
				lines.push(marker(" ", depth, "]"));
			} else if (value !== null && typeof value === "object") {
				lines.push(marker(" ", depth, "{"));
				for (const [nestedKey, nestedValue] of Object.entries(value)) {
					renderKey(lines, nestedKey, nestedValue, depth + 1);
				}
				lines.push(marker(" ", depth, "}"));
			}
		}
		// `[" "]` (unchanged) elements are intentionally omitted.
	}
}

/**
 * Renders `<key>: <value>` (or just `<value>` when no key is given) with a single sign applied
 * to every line, expanding nested objects/arrays over multiple lines.
 */
function renderValueWithSign(
	lines: string[],
	sign: "+" | "-",
	key: string,
	value: JsonLike,
	depth: number
): void {
	const valueLines = renderValueLines(value);
	lines.push(marker(sign, depth, `${key}: ${valueLines[0]}`));
	for (let i = 1; i < valueLines.length; i++) {
		lines.push(marker(sign, depth, valueLines[i]));
	}
}

/** Renders a concrete JSON value into indented lines (object keys unquoted, no trailing commas). */
function renderValueLines(value: JsonLike): string[] {
	if (value === undefined) {
		return ["undefined"];
	}
	if (value === null || typeof value !== "object") {
		return [JSON.stringify(value)];
	}
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return ["[]"];
		}
		const lines = ["["];
		for (const element of value) {
			for (const line of renderValueLines(element)) {
				lines.push(INDENT + line);
			}
		}
		lines.push("]");
		return lines;
	}
	const entries = Object.entries(value);
	if (entries.length === 0) {
		return ["{}"];
	}
	const lines = ["{"];
	for (const [key, nested] of entries) {
		const nestedLines = renderValueLines(nested);
		lines.push(`${INDENT}${key}: ${nestedLines[0]}`);
		for (let i = 1; i < nestedLines.length; i++) {
			lines.push(INDENT + nestedLines[i]);
		}
	}
	lines.push("}");
	return lines;
}

/**
 * Given a diff object (generated by `diffJsonObjects`) this function computes whether the
 * difference is non-destructive, i.e. if the second object only contained additions to the
 * first one and no removal nor modifications.
 *
 * @param diff The difference object to use (generated by `diffJsonObjects`)
 * @returns `true` if the difference is non-destructive, `false` if it is
 */
export function isNonDestructive(diff: JsonLike): boolean {
	if (diff === null || typeof diff !== "object") {
		return true;
	}

	if (
		Object.keys(diff).some(
			(key) => key === "__old" || key.endsWith("__deleted")
		)
	) {
		return false;
	}

	if (Array.isArray(diff)) {
		for (const element of diff) {
			if (Array.isArray(element) && element.length === 2) {
				if (element[0] === "-") {
					return false;
				} else if (element[0] === "~") {
					return false;
				} else if (element[0] !== "+") {
					continue;
				}

				for (const innerElement of element) {
					if (!isNonDestructive(innerElement)) {
						return false;
					}
				}
			} else if (!isNonDestructive(element)) {
				return false;
			}
		}
	} else {
		for (const field in diff) {
			if (!isNonDestructive(diff[field])) {
				return false;
			}
		}
	}

	return true;
}

/**
 * A modified value in json-diff is represented as an object with two properties:
 * `__old` and `__new`. Where the former contains the old version of the value and
 * the latter the new one.
 * This utility, given an arbitrary value, discerns whether the value represents the
 * diff of a modified value.
 *
 * @param value The target value to check
 * @returns True if the value represents a value modified, false otherwise
 */
export function isModifiedDiffValue<T extends JsonLike>(
	value: unknown
): value is { __old: T; __new: T } {
	return !!(
		value &&
		typeof value === "object" &&
		Object.keys(value).length === 2 &&
		"__old" in value &&
		"__new" in value
	);
}
