import qs from 'query-string';
import jwt from '@tsndr/cloudflare-worker-jwt';
export const onRequestPost: ({ request: Request, env: Env }) => Promise<Response> = async ({
	request,
	env,
}) => {
	try {
		const body = await request.json();
		const token = await exchangeCodeForToken(body.code, env);
		const user: any = await fetchUser(token, env);
		const formattedUser = await formatUserResponse(user);
		const jwtToken: any = await encodeJWT(formattedUser, env.REACT_APP_SECRET_KEY);
		// Add the user information to the KV store called kv_userDatabase
		await env.kv_userDatabase.put(`${user.id}`, JSON.stringify({ user, token }));
		return new Response(JSON.stringify({ jwtToken }), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		return new Response(JSON.stringify({ error }));
	}
};

// This is a function that uses the code from client to get an access token.
async function exchangeCodeForToken(code: any, env: any) {
	const TokenURL = env.REACT_APP_TOKEN_ENDPOINT;
	const oAuthQueryParams = {
		grant_type: 'authorization_code',
		redirect_url: env.REACT_APP_REDIRECT_UR,
		client_id: env.REACT_APP_CLIENT_ID,
		client_secret: env.REACT_APP_CLIENT_SECRET,
		code,
	};

	const res = await fetch(TokenURL, {
		body: JSON.stringify(oAuthQueryParams),
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
	});

	const data = await res.text();
	const parsedData = qs.parse(data);
	return parsedData.access_token;
}
// This is a function that uses the access token to get the user information.
async function fetchUser(token: any, env: any) {
	const userURL = env.REACT_APP_RESOURCE_ENDPOINT + 'user';
	const res = await fetch(userURL, {
		headers: {
			'Authorization': `token ${token}`,
			'User-Agent': 'Mozilla/5.0', // Add user agent for GitHub API when using workers
		},
	});

	const data = await res.json();
	return data;
}

async function formatUserResponse(user: any) {
	return {
		name: user.name,
		username: user.login,
		id: user.id,
		avatar_url: user.avatar_url,
	};
}

async function encodeJWT(user: any, secret: string) {
	return jwt.sign(user, secret);
}
