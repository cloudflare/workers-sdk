export type Awaitable<T> = T | Promise<T>;
// TODO: allow dispatching more events?
export type Dispatcher = (
	type: "scheduled",
	init: { cron?: string }
) => Awaitable<void>;

export interface MiddlewareContext {
	dispatch: Dispatcher;
	next(request: Request, env: any): Awaitable<Response>;
}

export type Middleware = (
	request: Request,
	env: any,
	ctx: ExecutionContext,
	middlewareCtx: MiddlewareContext
) => Awaitable<Response>;

const __facade_middleware__: Middleware[] = [];

export function __facade_register__(...args: (Middleware | Middleware[])[]) {
	// This function allows for registering of one or many middleware
	for (const arg of arguments) {
		if (Array.isArray(arg)) {
			for (const middleware of arg) {
				__facade_middleware__.push(middleware);
			}
		} else {
			__facade_middleware__.push(arg);
		}
	}
}

export function __facade_registerInternal__(
	...args: (Middleware | Middleware[])[]
) {
	// This function allows for registering of one or many middleware
	// For internal middleware we want to push to the start of the stack
	// We reverse the ordering of the arrays such that they get inserted in the right order
	for (const arg of Array.from(arguments).reverse()) {
		if (Array.isArray(arg)) {
			for (const middleware of arg.reverse()) {
				__facade_middleware__.unshift(middleware);
			}
		} else {
			__facade_middleware__.unshift(arg);
		}
	}
}

function __facade_invokeChain__(
	request: Request,
	env: any,
	ctx: ExecutionContext,
	dispatch: Dispatcher,
	middlewareChain: Middleware[]
): Awaitable<Response> {
	const [head, ...tail] = middlewareChain;
	const middlewareCtx: MiddlewareContext = {
		dispatch,
		next(newRequest, newEnv) {
			return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
		},
	};
	return head(request, env, ctx, middlewareCtx);
}

export function __facade_invoke__(
	request: Request,
	env: any,
	ctx: ExecutionContext,
	dispatch: Dispatcher,
	finalMiddleware: Middleware
): Awaitable<Response> {
	return __facade_invokeChain__(request, env, ctx, dispatch, [
		...__facade_middleware__,
		finalMiddleware,
	]);
}
