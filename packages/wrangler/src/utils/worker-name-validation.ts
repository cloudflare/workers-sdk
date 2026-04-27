const invalidWorkerNameCharsRegex = /[^a-z0-9- ]/g;
const invalidWorkerNameStartEndRegex = /^(-+)|(-+)$/g;
const workerNameLengthLimit = 63;

/**
 * Checks whether the provided worker name is valid, this means that:
 *  - the name is not empty
 *  - the name doesn't start nor ends with a dash
 *  - the name doesn't contain special characters besides dashes
 *  - the name is not longer than 63 characters
 *
 * See: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/#limitations
 *
 * @param input The name to check
 * @returns Object indicating whether the name is valid, and if not a cause indicating why it isn't
 */
export function checkWorkerNameValidity(
	input: string
): { valid: false; cause: string } | { valid: true } {
	if (!input) {
		return {
			valid: false,
			cause: "Worker names cannot be empty.",
		};
	}

	if (input.match(invalidWorkerNameStartEndRegex)) {
		return {
			valid: false,
			cause: "Worker names cannot start or end with a dash.",
		};
	}

	if (input.match(invalidWorkerNameCharsRegex)) {
		return {
			valid: false,
			cause:
				"Project names must only contain lowercase characters, numbers, and dashes.",
		};
	}

	if (input.length > workerNameLengthLimit) {
		return {
			valid: false,
			cause: "Project names must be less than 63 characters.",
		};
	}

	return { valid: true };
}

/**
 * Given an input string it converts it to a valid worker name
 *
 * A worker name is valid if:
 *  - the name is not empty
 *  - the name doesn't start nor ends with a dash
 *  - the name doesn't contain special characters besides dashes
 *  - the name is not longer than 63 characters
 *
 * See: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/#limitations
 *
 * @param input The input to convert
 * @returns The input itself if it was already valid, the input converted to a valid worker name otherwise
 */
export function toValidWorkerName(input: string): string {
	if (checkWorkerNameValidity(input).valid) {
		return input;
	}

	input = input
		// Lowercase uppercase letters before replacing invalid chars
		.toLowerCase()
		// Replace all underscores with dashes
		.replaceAll("_", "-")
		// Replace all the special characters (besides dashes) with dashes
		.replace(invalidWorkerNameCharsRegex, "-")
		// Remove invalid start/end dashes
		.replace(invalidWorkerNameStartEndRegex, "")
		// If the name is longer than the limit let's truncate it to that
		.slice(0, workerNameLengthLimit);

	if (!input.length) {
		// If we've emptied the whole name let's replace it with a fallback value
		return "my-worker";
	}

	return input;
}
