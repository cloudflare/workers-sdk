import { logger } from "../logger";
import { drawBox } from "./box";
import { levenshteinDistance } from "./levenshtein";

/**
 * Given an unknown input string and a list of valid candidates, returns the
 * closest candidate whose Levenshtein distance is within the given threshold.
 * Comparison is case-insensitive. If multiple candidates share the same
 * distance, the first one encountered (in iteration order) is returned.
 *
 * The effective threshold for each candidate is scaled down based on the
 * shorter of the input and candidate lengths, so that short candidates (e.g.
 * "d1", "ai") require a proportionally closer match and don't produce
 * nonsensical suggestions.
 *
 * @param input - The unknown input string to find a suggestion for
 * @param candidates - An iterable of valid candidate strings to compare against
 * @param maxDistance - The upper-bound Levenshtein distance for a candidate to
 *   be considered a match. Defaults to 3. The actual threshold per candidate
 *   is `min(maxDistance, floor(min(inputLen, candidateLen) * 2 / 3))`.
 * @returns The closest matching candidate, or `undefined` if no candidate is
 *   within the threshold
 */
export function getSuggestion(
	input: string,
	candidates: Iterable<string>,
	maxDistance: number = 3
): string | undefined {
	const lowerInput = input.toLowerCase();
	let bestMatch: string | undefined;
	let bestDistance = maxDistance + 1;

	for (const candidate of candidates) {
		const distance = levenshteinDistance(lowerInput, candidate.toLowerCase());
		// Scale the threshold down for short candidates so we don't match
		// e.g. "cat" -> "ai" or "foo" -> "d1" just because they're within 3 edits.
		const effectiveMax = Math.min(
			maxDistance,
			bestDistance,
			Math.floor((Math.min(lowerInput.length, candidate.length) * 2) / 3)
		);
		if (distance <= effectiveMax) {
			bestDistance = distance;
			bestMatch = candidate;
		}
	}

	return bestMatch;
}

/**
 * Finds the closest matching command for an unknown input and logs a "Did you
 * mean ...?" suggestion to the user if a match is found.
 *
 * @param unknownCommand - The unrecognized command or subcommand entered by
 *   the user
 * @param candidates - An iterable of valid command names to compare against
 * @param commandPrefix - The prefix to display before the suggestion (e.g.,
 *   `"wrangler"` or `"wrangler kv"`)
 * @param trailingArgs - Additional arguments that appeared after the typo and
 *   should be preserved in the suggestion (e.g., `["create"]` so that
 *   `wrangler kv namespacess create` suggests `wrangler kv namespace create`)
 */
export function logDidYouMean(
	unknownCommand: string,
	candidates: Iterable<string>,
	commandPrefix: string,
	trailingArgs: string[] = []
): void {
	const suggestion = getSuggestion(unknownCommand, candidates);
	if (suggestion) {
		const parts = [commandPrefix, suggestion, ...trailingArgs];
		const box = drawBox([`Did you mean "${parts.join(" ")}"?`]);
		logger.info(`\n${box}\n`);
	}
}
