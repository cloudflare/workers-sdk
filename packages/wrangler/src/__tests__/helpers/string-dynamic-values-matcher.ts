export type PatternReplacementPair = [string | RegExp, string];

/**
 * Sometimes, we might need to test strings that contain dynamic |
 * random | generated data (such as file hashes, IDs, etc.).
 *
 * This helper function replaces the dynamic parts of such strings with
 * static values, thus enabling us to properly test the contents of the
 * string.
 *
 * see https://jestjs.io/docs/snapshot-testing#property-matchers
 */
export function replaceRandomWithConstantData(
	stringWithRandomData: string,
	patternReplacementPairs: Array<PatternReplacementPair>
) {
	let stringWithConstantData = stringWithRandomData;

	patternReplacementPairs.forEach(
		(pair) =>
			(stringWithConstantData = stringWithConstantData.replace(
				pair[0], // pattern
				pair[1] // replacement
			))
	);

	// Normalize FormData boundary formatting for cross-platform consistency
	// On different platforms (macOS vs Linux), FormData boundaries may format differently
	// Convert "------formdata-undici-0.test--"" to "------formdata-undici-0.test--\n\t\t\t\t""
	stringWithConstantData = stringWithConstantData.replace(
		/(------formdata-undici-[^\n-]+)--"/g,
		'$1--\n\t\t\t\t"'
	);

	return stringWithConstantData;
}
