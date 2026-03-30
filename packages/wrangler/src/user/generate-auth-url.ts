interface GenerateAuthUrlProps {
	authUrl: string;
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
	authUrl,
	clientId,
	scopes,
	stateQueryParam,
	codeChallenge,
	callbackUrl = OAUTH_CALLBACK_URL,
}: GenerateAuthUrlProps) => {
	return (
		authUrl +
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
