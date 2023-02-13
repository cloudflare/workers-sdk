import type * as worktop from 'worktop';
import type { KV } from 'worktop/cfw.kv';
import type { Factory } from 'worktop/jwt';
import type { ULID, UUID } from 'worktop/utils';

import type * as Models from './utils/models';

export interface Todo {
	uid: ULID;
	owner: User['uid'];
	text: string;
	done?: boolean;
}

export interface User {
	uid: UUID;
}

export type TokenPayload = Pick<User, 'uid'>;

export interface Context extends worktop.Context {
	token?: TokenPayload;
	$token?: Factory<TokenPayload>;

	user?: User;
	$user?: Models.User;

	todo?: Todo;
	$todo?: Models.Todo;

	bindings: {
		JWT_SECRET: string;
		DATABASE: KV.Namespace;
	};
}

export type Handler<C extends worktop.Context = Context, P = worktop.Params> = worktop.Handler<
	C,
	P
>;
