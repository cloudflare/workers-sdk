import { Router } from 'worktop';
import { compose } from 'worktop';
import * as utils from 'worktop/utils';
import { reply } from 'worktop/response';
import * as Models from '../utils/models';
import * as Token from '../utils/token';

import type { Context, User } from '../context';

export const Auth = new Router<Context>();

/**
 * POST /auth/login
 */
Auth.add('POST', '/login', async (req, context) => {
	let user: User;
	if (req.headers.has('authorization')) {
		// Runs `load` before `identify`, but only if `load` didnt reply
		let tmp = await compose(Token.load, Token.identify)(req, context);
		if (tmp instanceof Response) return tmp;
		user = context.user!;
	} else {
		user = { uid: utils.uuid() };
		context.$user ||= new Models.User(context.bindings.DATABASE);
		let isOK = await context.$user.put(user.uid, user);
		if (!isOK) return reply(400, 'Error saving user');
	}

	try {
		Token.setup(context); //~> `$token` exists
		var token = await context.$token!.sign(user);
	} catch (err) {
		return reply(400, 'Error with signing new token');
	}

	let authorization = `bearer ${token}`;
	return reply(200, { token }, { authorization });
});
