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

type EventPluginContext<Env, P extends string, Data, PluginArgs> = {
	request: Request;
	functionPath: string;
	waitUntil: (promise: Promise<unknown>) => void;
	passThroughOnException: () => void;
	next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
	env: Env & { ASSETS: { fetch: typeof fetch } };
	params: Params<P>;
	data: Data;
	pluginArgs: PluginArgs;
};

declare type PagesFunction<
	Env = unknown,
	P extends string = string,
	Data extends Record<string, unknown> = Record<string, unknown>
> = (context: EventContext<Env, P, Data>) => Response | Promise<Response>;

declare type PagesPluginFunction<
	Env = unknown,
	P extends string = string,
	Data extends Record<string, unknown> = Record<string, unknown>,
	PluginArgs = unknown
> = (
	context: EventPluginContext<Env, P, Data, PluginArgs>
) => Response | Promise<Response>;
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
			break;
		}
	}
}

export default function (pluginArgs: unknown) {
	const onRequest: PagesPluginFunction = async (workerContext) => {
		let { request } = workerContext;
		const { env, next } = workerContext;
		let { data } = workerContext;

		const url = new URL(request.url);
		// TODO: Replace this with something actually legible.
		const relativePathname = `/${
			url.pathname.replace(workerContext.functionPath, "") || ""
		}`.replace(/^\/\//, "/");

		const middlewares = collectHandlersWrappers(
			request,
			relativePathname,
			"middlewares"
		);

		const numOfMiddlewareHandlers = middlewares
			.map(({ handlers }) => handlers.length ?? 0)
			.reduce((a, b) => a + b, 0);

		const modules = collectHandlersWrappers(
			request,
			relativePathname,
			"modules"
		);
		const module = modules[0];

		const numberOfHandlers = numOfMiddlewareHandlers + (module ? 1 : 0);

		const handlerIterator = executeRequest(middlewares, modules[0]);

		const pluginNext = async (input?: RequestInfo, init?: RequestInit) => {
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
					functionPath: workerContext.functionPath + path,
					next: pluginNext,
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
					pluginArgs,
					env,
					waitUntil: workerContext.waitUntil.bind(workerContext),
					passThroughOnException:
						workerContext.passThroughOnException.bind(workerContext),
				};

				const response = await handler(context);

				return cloneResponse(response);
			} else {
				return next(request);
			}
		};

		return pluginNext();
	};

	return onRequest;
}

// This makes a Response mutable
const cloneResponse = (response: Response) =>
	// https://fetch.spec.whatwg.org/#null-body-status
	new Response(
		[101, 204, 205, 304].includes(response.status) ? null : response.body,
		response
	);

function collectHandlersWrappers(
	request: Request,
	relativePathname: string,
	kind: "middlewares" | "modules"
): HandlersWrapper[] {
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
			const matchResult = routeMatcher(relativePathname);
			const mountMatchResult = mountMatcher(relativePathname);
			if (matchResult && mountMatchResult) {
				return {
					handlers: route[kind],
					matchResult,
					mountMatchResult,
				};
			}
		})
		.filter(Boolean) as HandlersWrapper[];
}
