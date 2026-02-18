/**
 * Performs a recursive deep equality comparison between two values.
 *
 * Handles primitives, `null`, arrays, and plain objects. Values are
 * considered equal when they share the same keys and all nested
 * values are themselves deeply equal.
 *
 * @param a - The first value to compare.
 * @param b - The second value to compare.
 *
 * @returns `true` if the values are deeply equal, `false` otherwise.
 */
export function isEqual(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}

	if (
		a === null ||
		b === null ||
		typeof a !== "object" ||
		typeof b !== "object"
	) {
		return false;
	}

	if (Array.isArray(a) !== Array.isArray(b)) {
		return false;
	}

	const keysA = Object.keys(a);
	const keysB = Object.keys(b);

	if (keysA.length !== keysB.length) {
		return false;
	}

	for (const key of keysA) {
		if (
			!Object.prototype.hasOwnProperty.call(b, key) ||
			!isEqual(
				(a as Record<string, unknown>)[key],
				(b as Record<string, unknown>)[key]
			)
		) {
			return false;
		}
	}

	return true;
}
