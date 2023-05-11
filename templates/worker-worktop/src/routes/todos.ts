import * as utils from 'worktop/utils';
import { reply } from 'worktop/response';
import { Router, compose } from 'worktop';
import * as Models from '../utils/models';
import * as Token from '../utils/token';

import type { Todo, Context, Handler } from '../context';

// Middleware for this router
// ~> Ensure the `context.user` owns the `context.todo`
const isOwner: Handler = async function (req, context) {
	let { $todo, user } = context;

	let item = await $todo!.get(context.params.uid);

	// send ambigious 404 message if not owner
	if (!item || item.owner !== user!.uid) {
		return reply(404, 'Item not found');
	}

	context.todo = item;
};

export const Todos = new Router<Context>();

Todos.prepare = compose(Token.load, Token.identify, function (req, context) {
	context.$todo ||= new Models.Todo(context.bindings.DATABASE);
});

/**
 * GET /todos
 */
Todos.add('GET', '/', async (req, context) => {
	let { user, $user } = context;

	let tmp = context.url.searchParams.get('limit');
	let limit = Math.min(tmp ? +tmp : 100, 100);

	let arr = await $user!.todos(user!.uid, limit);
	return reply(200, arr);
});

/**
 * GET /todos/:uid
 */
Todos.add(
	'GET',
	'/:uid',
	compose(isOwner, (req, context) => {
		// Exists via `isOwner`
		return reply(200, context.todo!);
	})
);

/**
 * POST /todos
 */
Todos.add('POST', '/', async (req, context) => {
	try {
		var input = await utils.body<Todo>(req);
	} catch (err) {
		return reply(400, 'Error parsing request body');
	}

	if (!input) return reply(400, 'Missing request body');

	let { text, done } = input;

	text = (text || '').trim();
	if (!text) return reply(422, { text: 'required' });

	let { user, $todo } = context;

	let todo: Todo = {
		uid: utils.ulid(),
		owner: user!.uid,
		done: !!done,
		text: text,
	};

	let location = `/todos/${todo.uid}`;
	let isOK = await $todo!.put(todo.uid, todo);
	if (!isOK) return reply(400, 'Error creating item');
	else return reply(201, todo, { location });
});

/**
 * PATCH /todos/:uid
 */
Todos.add(
	'PATCH',
	'/:uid',
	compose(isOwner, async (req, context) => {
		try {
			var input = await utils.body<Todo>(req);
		} catch (err) {
			return reply(400, 'Error parsing request body');
		}

		let { text, done } = input || {};
		if (!text && done == null) return reply(204);

		// Exists via `isOwner`
		let todo = context.todo!;
		todo.text = (text && text.trim()) || todo.text;
		todo.done = done != null ? !!done : todo.done;

		let isOK = await context.$todo!.put(todo.uid, todo);
		if (!isOK) return reply(400, 'Error updating item');
		else return reply(200, todo);
	})
);

/**
 * DELETE /todos/:uid
 */
Todos.add(
	'DELETE',
	'/:uid',
	compose(isOwner, async (req, context) => {
		// Exists via `isOwner` middleware
		let isOK = await context.$todo!.delete(context.todo!.uid);
		if (!isOK) return reply(400, 'Error deleting item');
		else return reply(204);
	})
);
