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

export function __facade_register__(
	// If insertFront is true, we insert the middleware first (we do this with internal middleware)
	middleware: Middleware | Middleware[],
	insertFront = false
) {
	// This function allows for registering of one or many middleware
	if (insertFront) __facade_middleware__.unshift(...[middleware].flat());
	else __facade_middleware__.push(...[middleware].flat());
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
