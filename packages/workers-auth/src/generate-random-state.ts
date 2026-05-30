import { webcrypto as crypto } from "node:crypto";
import { PKCE_CHARSET } from "./pkce";

/**
 * Generates random state to be passed for anti-csrf.
 *
 * Extracted from the rest of the OAuth flow so consumers (or tests) can
 * substitute a deterministic implementation when a stable state value is
 * needed (e.g. for snapshot testing).
 */
export function generateRandomState(lengthOfState: number): string {
	const output = new Uint32Array(lengthOfState);
	crypto.getRandomValues(output);
	return Array.from(output)
		.map((num: number) => PKCE_CHARSET[num % PKCE_CHARSET.length])
		.join("");
}
