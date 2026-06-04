/* Based heavily on code from https://github.com/BitySA/oauth2-auth-code-pkce
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { webcrypto as crypto } from "node:crypto";
import { TextEncoder } from "node:util";

/**
 * The maximum length for a code verifier for the best security we can offer.
 * Please note the NOTE section of RFC 7636 § 4.1 - the length must be >= 43,
 * but <= 128, **after** base64 url encoding. This means 32 code verifier bytes
 * encoded will be 43 bytes, or 96 bytes encoded will be 128 bytes. So 96 bytes
 * is the highest valid value that can be used.
 */
export const RECOMMENDED_CODE_VERIFIER_LENGTH = 96;

/**
 * A sensible length for the state's length, for anti-csrf.
 */
export const RECOMMENDED_STATE_LENGTH = 32;

/**
 * Character set to generate code verifier defined in rfc7636.
 */
export const PKCE_CHARSET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export interface PKCECodes {
	codeChallenge: string;
	codeVerifier: string;
}

/**
 * Implements *base64url-encode* (RFC 4648 § 5) without padding, which is NOT
 * the same as regular base64 encoding.
 */
export function base64urlEncode(value: string): string {
	let base64 = btoa(value);
	base64 = base64.replace(/\+/g, "-");
	base64 = base64.replace(/\//g, "_");
	base64 = base64.replace(/=/g, "");
	return base64;
}

/**
 * Generates a code_verifier and code_challenge, as specified in rfc7636.
 */
export async function generatePKCECodes(): Promise<PKCECodes> {
	const output = new Uint32Array(RECOMMENDED_CODE_VERIFIER_LENGTH);
	crypto.getRandomValues(output);
	const codeVerifier = base64urlEncode(
		Array.from(output)
			.map((num: number) => PKCE_CHARSET[num % PKCE_CHARSET.length])
			.join("")
	);
	const buffer = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(codeVerifier)
	);
	const hash = new Uint8Array(buffer);
	let binary = "";
	const hashLength = hash.byteLength;
	for (let i = 0; i < hashLength; i++) {
		binary += String.fromCharCode(hash[i]);
	}
	const codeChallenge = base64urlEncode(binary);
	return { codeChallenge, codeVerifier };
}
