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
