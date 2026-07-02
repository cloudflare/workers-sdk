/**
 * Computes the Levenshtein distance between two strings using an iterative
 * dynamic programming approach. The Levenshtein distance is the minimum number
 * of single-character edits (insertions, deletions, or substitutions) required
 * to transform one string into the other.
 *
 * Uses O(min(n, m)) space by only keeping two rows of the DP matrix.
 *
 * @param a - The first string
 * @param b - The second string
 * @returns The Levenshtein distance between the two strings
 */
export function levenshteinDistance(a: string, b: string): number {
	// Ensure `a` is the shorter string so we use less memory
	if (a.length > b.length) {
		[a, b] = [b, a];
	}

	const aLen = a.length;
	const bLen = b.length;

	// previous and current row of distances
	let prev = Array.from({ length: aLen + 1 }, (_, i) => i);
	let curr = new Array<number>(aLen + 1);

	for (let j = 1; j <= bLen; j++) {
		curr[0] = j;

		for (let i = 1; i <= aLen; i++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[i] = Math.min(
				prev[i] + 1, // deletion
				curr[i - 1] + 1, // insertion
				prev[i - 1] + cost // substitution
			);
		}

		[prev, curr] = [curr, prev];
	}

	return prev[aLen];
}
