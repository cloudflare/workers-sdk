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
interface GenerateAuthUrlProps {
	authUrl: string;
	clientId: string;
	scopes: string[];
	stateQueryParam: string;
	codeChallenge: string;
	redirectUri: string;
}

/**
 * Build the OAuth 2.0 authorize URL for the Cloudflare auth endpoint.
 *
 * Extracted from the rest of the OAuth flow so consumers (or tests) can
 * substitute a deterministic implementation when a stable URL is needed
 * (e.g. for snapshot testing).
 */
export const generateAuthUrl = ({
	authUrl,
	clientId,
	scopes,
	stateQueryParam,
	codeChallenge,
	redirectUri,
}: GenerateAuthUrlProps) => {
	return (
		authUrl +
		`?response_type=code&` +
		`client_id=${encodeURIComponent(clientId)}&` +
		`redirect_uri=${encodeURIComponent(redirectUri)}&` +
		// we add offline_access manually for every request
		`scope=${encodeURIComponent([...scopes, "offline_access"].join(" "))}&` +
		`state=${stateQueryParam}&` +
		`code_challenge=${encodeURIComponent(codeChallenge)}&` +
		`code_challenge_method=S256`
	);
};
