import { Entity } from 'worktop/cfw.kv';
import type { UUID, ULID } from 'worktop/utils';
import type * as types from '../context';

export class Todo extends Entity<types.Todo> {
	prefix = 'todos';
	ttl = 1800; // 30m

	static owner(userid: UUID, todoid?: ULID) {
		let key = `users~${userid}__todos__`;
		if (todoid) key += todoid;
		return key;
	}

	async onwrite(_: string, value: types.Todo) {
		let key = Todo.owner(value.owner, value.uid);
		await this.ns.put(key, '1');
	}

	async ondelete(_: string, value: types.Todo) {
		let key = Todo.owner(value.owner, value.uid);
		await this.ns.delete(key);
	}

	put(key: string, value: types.Todo | null): Promise<boolean> {
		if (value) {
			let { done } = value;
			// default `done` to false
			value.done = done == null ? false : /true|1/i.test('' + done);
		}
		return super.put(key, value);
	}
}

export class User extends Entity<types.User> {
	prefix = 'users';
	ttl = 3600; // 1h

	async todos(userid: UUID, limit = 100) {
		const prefix = Todo.owner(userid);
		const keys = await super.list({ prefix, limit });

		// keep the last 26 characters only (ULID length)
		for (let i = 0; i < keys.length; i++) {
			keys[i] = keys[i].slice(-26);
		}

		return keys;
	}
}
