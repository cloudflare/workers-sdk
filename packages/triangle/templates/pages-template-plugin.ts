import { match } from "path-to-regexp";

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

function* executeRequest(request: Request, relativePathname: string) {
	// First, iterate through the routes (backwards) and execute "middlewares" on partial route matches
	for (const route of [...routes].reverse()) {
		if (route.method && route.method !== request.method) {
			continue;
		}

		// replaces with "\\$&", this prepends a backslash to the matched string, e.g. "[" becomes "\["
		const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
			end: false,
		});
		const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
			end: false,
		});
		const matchResult = routeMatcher(relativePathname);
		const mountMatchResult = mountMatcher(relativePathname);
		if (matchResult && mountMatchResult) {
			for (const handler of route.middlewares.flat()) {
				yield {
					handler,
					params: matchResult.params as Params,
					path: mountMatchResult.path,
				};
			}
		}
	}

	// Then look for the first exact route match and execute its "modules"
	for (const route of routes) {
		if (route.method && route.method !== request.method) {
			continue;
		}

		const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
			end: true,
		});
		const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
			end: false,
		});
		const matchResult = routeMatcher(relativePathname);
		const mountMatchResult = mountMatcher(relativePathname);
		if (matchResult && mountMatchResult && route.modules.length) {
			for (const handler of route.modules.flat()) {
				yield {
					handler,
					params: matchResult.params as Params,
					path: matchResult.path,
				};
			}
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

		const handlerIterator = executeRequest(request, relativePathname);
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
					request: new Request(request.clone()),
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
