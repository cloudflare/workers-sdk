import { webcrypto } from "node:crypto";

/**
 * Generates a random state string for PKCE OAuth flows.
 *
 * @param lengthOfState The length of the random state string to generate.
 * @returns A random state string.
 */
export function generatePKCERandomState(lengthOfState: number): string {
	const PKCE_CHARSET =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

	const output = new Uint32Array(lengthOfState);
	webcrypto.getRandomValues(output);
	return Array.from(output)
		.map((num: number) => PKCE_CHARSET[num % PKCE_CHARSET.length])
		.join("");
}
