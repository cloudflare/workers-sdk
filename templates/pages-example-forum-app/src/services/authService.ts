import qs from 'query-string';
import { User } from '../types';
import jwt from '@tsndr/cloudflare-worker-jwt';

// This is a service class that handles the authentication of the user by sending a request to the server with the code.
// and returns a promise that resolves to the user object.
class AuthService {
	async loginViaGithub() {
		const parsedQuery = qs.parseUrl(
			// @ts-expect-error fix this type error
			window.location.href
		);
		const response = await fetch('/api/code', {
			method: 'POST',
			body: JSON.stringify({
				code: parsedQuery.query.code,
				state: parsedQuery.query.state,
			}),
			headers: { 'Content-Type': 'application/json' },
		});
		const data = await response.json();
		return data as { jwtToken: string };
	}

	async getUser() {
		const decodedstring =
			// @ts-expect-error fix this type error
			process.env.REACT_APP_SECRET_KEY;

		const token: string | null =
			// @ts-expect-error fix this type error
			localStorage.getItem('token');
		if (token !== null) {
			const verifiedJWT = await jwt.verify(token, decodedstring as string);
			if (verifiedJWT) {
				const decoded = jwt.decode(token);
				return decoded.payload as User;
			}
			return null;
		}
		return null;
	}
}

export default new AuthService();
