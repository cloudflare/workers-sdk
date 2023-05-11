import { HS256 } from 'worktop/jwt';
import { reply } from 'worktop/response';

import * as Models from '../utils/models';

import type { Context, Handler } from '../context';

export function setup(context: Context) {
	return (context.$token ||= HS256({
		key: context.bindings.JWT_SECRET,
	}));
}

/**
 * Parse & verify the "Authorization" header.
 * @note Provides the `context.$token` and `context.token` properties.
 */
export const load: Handler = async function (req, context) {
	let auth = req.headers.get('Authorization');
	if (!auth) return reply(401, 'Missing "Authorization" header');

	let [scheme, jwt] = auth.split(/\s+/g);
	if (!scheme || !jwt) return reply(400, 'Invalid "Authorization" header');

	if (scheme.toLowerCase() !== 'bearer') {
		return reply(400, 'Invalid "Authorization" scheme');
	}

	context.$token ||= setup(context);

	try {
		var token = await context.$token.verify(jwt);
		if (!token.uid) throw new Error();
		context.token = token;
	} catch (err) {
		return reply(401, 'Invalid "Authorization" token');
	}
};

/**
 * Exchange a verified JWT for a `User` document, if any.
 * @important Must be invoked after `Token.load` middleware.
 * @note Provides the `context.$user` and `context.user` properties.
 */
export const identify: Handler = async function (req, context) {
	context.$user ||= new Models.User(context.bindings.DATABASE);

	let token = context.token;
	if (!token) return reply(500, 'Missing token payload');

	let user = await context.$user.get(token.uid);

	if (user) context.user = user;
	else return reply(401, 'Invalid "Authorization" token');
};
