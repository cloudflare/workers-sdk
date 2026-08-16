/**
 * Computes the Levenshtein distance between two strings using a recursive
 * approach with memoization. The Levenshtein distance is the minimum number
 * of single-character edits (insertions, deletions, or substitutions) required
 * to transform one string into the other.
 *
 * @param a - The first string
 * @param b - The second string
 * @param cache - Internal memoization cache; callers should not pass this
 * @returns The Levenshtein distance between the two strings
 */
export function levenshteinDistance(
	a: string,
	b: string,
	cache = new Map<string, number>()
): number {
	const key = `${a}|${b}`;
	const cacheValue = cache.get(key);
	if (cacheValue !== undefined) {
		return cacheValue;
	}
	let result;
	if (b == "") {
		result = a.length;
	} else if (a == "") {
		result = b.length;
	} else if (a[0] === b[0]) {
		result = levenshteinDistance(a.slice(1), b.slice(1), cache);
	} else {
		result =
			1 +
			Math.min(
				levenshteinDistance(a.slice(1), b, cache),
				levenshteinDistance(a, b.slice(1), cache),
				levenshteinDistance(a.slice(1), b.slice(1), cache)
			);
	}
	cache.set(key, result);
	return result;
}
