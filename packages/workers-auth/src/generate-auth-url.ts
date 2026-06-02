interface GenerateAuthUrlProps {
	authUrl: string;
	clientId: string;
	scopes: string[];
	stateQueryParam: string;
	codeChallenge: string;
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
}: GenerateAuthUrlProps) => {
	return (
		authUrl +
		`?response_type=code&` +
		`client_id=${encodeURIComponent(clientId)}&` +
		`redirect_uri=${encodeURIComponent(OAUTH_CALLBACK_URL)}&` +
		// we add offline_access manually for every request
		`scope=${encodeURIComponent([...scopes, "offline_access"].join(" "))}&` +
		`state=${stateQueryParam}&` +
		`code_challenge=${encodeURIComponent(codeChallenge)}&` +
		`code_challenge_method=S256`
	);
};
