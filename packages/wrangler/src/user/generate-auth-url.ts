interface GenerateAuthUrlProps {
	/**
	 * Origin of the OAuth authorization server (scheme + host + optional
	 * port — NO path, NO trailing slash, NO query string). The function
	 * appends the `/oauth2/auth` path itself, so the leading `?` cannot
	 * collide with a pre-existing query string in the caller-supplied
	 * value (REVIEW-17452 #39).
	 *
	 * Use `getAuthOriginFromEnv()` from `auth-variables.ts` to derive a
	 * value of this shape from the `WRANGLER_AUTH_URL` env var.
	 */
	authOrigin: string;
	clientId: string;
	scopes: string[];
	stateQueryParam: string;
	codeChallenge: string;
	callbackUrl?: string;
}

export const OAUTH_CALLBACK_URL = "http://localhost:8976/oauth/callback";

/**
 * generateAuthUrl was extracted from getAuthURL in user.tsx
 * to make it possible to mock the generated URL
 */
export const generateAuthUrl = ({
	authOrigin,
	clientId,
	scopes,
	stateQueryParam,
	codeChallenge,
	callbackUrl = OAUTH_CALLBACK_URL,
}: GenerateAuthUrlProps) => {
	return (
		`${authOrigin}/oauth2/auth` +
		`?response_type=code&` +
		`client_id=${encodeURIComponent(clientId)}&` +
		`redirect_uri=${encodeURIComponent(callbackUrl)}&` +
		// we add offline_access manually for every request
		`scope=${encodeURIComponent([...scopes, "offline_access"].join(" "))}&` +
		`state=${stateQueryParam}&` +
		`code_challenge=${encodeURIComponent(codeChallenge)}&` +
		`code_challenge_method=S256`
	);
};
