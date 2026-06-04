interface GenerateAuthUrlProps {
	authUrl: string;
	clientId: string;
	scopes: string[];
	stateQueryParam: string;
	codeChallenge: string;
	/**
	 * The `redirect_uri` the OAuth provider will redirect back to. Defaults to
	 * {@link OAUTH_CALLBACK_URL}. Consumers that register a different callback
	 * URL on their OAuth app (e.g. a different port) pass it here.
	 */
	redirectUri?: string;
}

export const OAUTH_CALLBACK_URL = "http://localhost:8976/oauth/callback";

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
	redirectUri = OAUTH_CALLBACK_URL,
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
