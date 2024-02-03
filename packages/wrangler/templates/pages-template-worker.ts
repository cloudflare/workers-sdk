import { match } from "path-to-regexp";
import type { MatchResult } from "path-to-regexp";

//note: this explicitly does not include the * character, as pages requires this
const escapeRegex = /[.+?^${}()|[\]\\]/g;

type HTTPMethod =
	| "HEAD"
	| "OPTIONS"
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE";

/* TODO: Grab these from @cloudflare/workers-types instead */
type Params<P extends string = string> = Record<P, string | string[]>;

type EventContext<Env, P extends string, Data> = {
	request: Request;
	functionPath: string;
	waitUntil: (promise: Promise<unknown>) => void;
	passThroughOnException: () => void;
	next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
	env: Env & { ASSETS: { fetch: typeof fetch } };
	params: Params<P>;
	data: Data;
};

declare type PagesFunction<
	Env = unknown,
	P extends string = string,
	Data extends Record<string, unknown> = Record<string, unknown>
> = (context: EventContext<Env, P, Data>) => Response | Promise<Response>;
/* end @cloudflare/workers-types */

type RouteHandler = {
	routePath: string;
	mountPath: string;
	method?: HTTPMethod;
	modules: PagesFunction[];
	middlewares: PagesFunction[];
};

// inject `routes` via ESBuild
declare const routes: RouteHandler[];
// define `__FALLBACK_SERVICE__` via ESBuild
declare const __FALLBACK_SERVICE__: string;

// expect an ASSETS fetcher binding pointing to the asset-server stage
type FetchEnv = {
	[name: string]: { fetch: typeof fetch };
	ASSETS: { fetch: typeof fetch };
};

type WorkerContext = {
	waitUntil: (promise: Promise<unknown>) => void;
	passThroughOnException: () => void;
};

type HandlersWrapper = {
	handlers: PagesFunction<unknown, string, Record<string, unknown>>[];
	matchResult: MatchResult<object>;
	mountMatchResult: MatchResult<object>;
};

function* executeRequest(
	middlewares: HandlersWrapper[],
	module: HandlersWrapper | undefined
) {
	for (const middleware of middlewares) {
		const { handlers, matchResult, mountMatchResult } = middleware!;
		for (const handler of handlers) {
			yield {
				handler,
				params: matchResult.params as Params,
				path: mountMatchResult.path,
			};
		}
	}

	if (module) {
		const { handlers, matchResult } = module;
		for (const handler of handlers) {
			yield {
				handler,
				params: matchResult.params as Params,
				path: matchResult.path,
			};
		}
	}
}

export default {
	async fetch(
		originalRequest: Request,
		env: FetchEnv,
		workerContext: WorkerContext
	) {
		let request = originalRequest;

		const middlewares = collectHandlersWrappers(request, "middlewares");

		const numOfMiddlewareHandlers = middlewares
			.map(({ handlers }) => handlers.length ?? 0)
			.reduce((a, b) => a + b, 0);

		const modules = collectHandlersWrappers(request, "modules");
		const module = modules[0];

		const numberOfHandlers =
			numOfMiddlewareHandlers + module?.handlers.length ?? 0;

		const handlerIterator = executeRequest(middlewares, module);

		let data = {}; // arbitrary data the user can set between functions
		let isFailOpen = false;

		const next = async (input?: RequestInfo, init?: RequestInit) => {
			if (input !== undefined) {
				let url = input;
				if (typeof input === "string") {
					url = new URL(input, request.url).toString();
				}
				request = new Request(url, init);
			}

			const result = handlerIterator.next();
			// Note we can't use `!result.done` because this doesn't narrow to the correct type
			if (result.done === false) {
				const { handler, params, path } = result.value;
				const context = {
					request: new Request(
						// Note: We should never clone the request because this might cause requests to remain unused, waste
						//       memory and generate runtime workerd errors/warnings, the potential cloning of the request
						//       should be the user's responsibility.
						//       We cannot however remove the `clone()` call here because when there are multiple handlers,
						//       currently more than one of them can read the request body (without them ever cloning the request),
						//       so in order not to have to introduce a breaking change we are calling `clone()` only when more than
						//       one handler is present, otherwise it is safe to just use the original request object.
						//       In the next major release we should remove the `clone()` call entirely.
						numberOfHandlers > 1 ? request.clone() : request
					),
					functionPath: path,
					next,
					params,
					get data() {
						return data;
					},
					set data(value) {
						if (typeof value !== "object" || value === null) {
							throw new Error("context.data must be an object");
						}
						// user has overriden context.data, so we need to merge it with the existing data
						data = value;
					},
					env,
					waitUntil: workerContext.waitUntil.bind(workerContext),
					passThroughOnException: () => {
						isFailOpen = true;
					},
				};

				const response = await handler(context);

				if (!(response instanceof Response)) {
					throw new Error("Your Pages function should return a Response");
				}

				return cloneResponse(response);
			} else if (__FALLBACK_SERVICE__) {
				// There are no more handlers so finish with the fallback service (`env.ASSETS.fetch` in Pages' case)
				const response = await env[__FALLBACK_SERVICE__].fetch(request);
				return cloneResponse(response);
			} else {
				// There was not fallback service so actually make the request to the origin.
				const response = await fetch(request);
				return cloneResponse(response);
			}
		};

		try {
			return await next();
		} catch (error) {
			if (isFailOpen) {
				const response = await env[__FALLBACK_SERVICE__].fetch(request);
				return cloneResponse(response);
			}

			throw error;
		}
	},
};

// This makes a Response mutable
const cloneResponse = (response: Response) =>
	// https://fetch.spec.whatwg.org/#null-body-status
	new Response(
		[101, 204, 205, 304].includes(response.status) ? null : response.body,
		response
	);

function collectHandlersWrappers(
	request: Request,
	kind: "middlewares" | "modules"
): HandlersWrapper[] {
	const requestPath = new URL(request.url).pathname;

	// If we're collecting middlewares, those need to be applied in the reverse order
	const targetRoutes = kind === "middlewares" ? [...routes].reverse() : routes;

	return targetRoutes
		.map((route) => {
			if (route.method && route.method !== request.method) {
				return null;
			}

			// replaces with "\\$&", this prepends a backslash to the matched string, e.g. "[" becomes "\["
			const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
				end: kind === "middlewares" ? false : true,
			});
			const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
				end: false,
			});
			const matchResult = routeMatcher(requestPath);
			const mountMatchResult = mountMatcher(requestPath);
			if (matchResult && mountMatchResult) {
				return {
					handlers: route[kind].flat(),
					matchResult,
					mountMatchResult,
				};
			}
		})
		.filter(Boolean) as HandlersWrapper[];
}
