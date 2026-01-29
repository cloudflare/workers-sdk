/**
 * Test worker for runtime tests.
 *
 * This worker defines simple Pages function handlers that can be tested
 * against the generated runtime code.
 */

// Import path-to-regexp (will be resolved at bundle time)
import { match } from "path-to-regexp";

// Simple handler functions for testing
const indexHandler = () => {
	return new Response("Hello from index");
};

const apiHelloGet = () => {
	return Response.json({ message: "Hello from GET /api/hello" });
};

const apiHelloPost = async (context: { request: Request }) => {
	const body = await context.request.json();
	return Response.json({ message: "Hello from POST", received: body });
};

const apiIdGet = (context: { params: Record<string, string> }) => {
	return Response.json({ id: context.params.id, method: "GET" });
};

const apiIdPut = async (context: {
	params: Record<string, string>;
	request: Request;
}) => {
	const body = await context.request.json();
	return Response.json({ id: context.params.id, method: "PUT", body });
};

const middleware = async (context: { next: () => Promise<Response> }) => {
	const response = await context.next();
	const newResponse = new Response(response.body, response);
	newResponse.headers.set("X-Middleware", "active");
	return newResponse;
};

// Route configuration (similar to what codegen produces)
const routes = [
	{
		routePath: "/api/hello",
		mountPath: "/api",
		method: "GET",
		middlewares: [middleware],
		modules: [apiHelloGet],
	},
	{
		routePath: "/api/hello",
		mountPath: "/api",
		method: "POST",
		middlewares: [middleware],
		modules: [apiHelloPost],
	},
	{
		routePath: "/api/:id",
		mountPath: "/api",
		method: "GET",
		middlewares: [middleware],
		modules: [apiIdGet],
	},
	{
		routePath: "/api/:id",
		mountPath: "/api",
		method: "PUT",
		middlewares: [middleware],
		modules: [apiIdPut],
	},
	{
		routePath: "/",
		mountPath: "/",
		method: "",
		middlewares: [middleware],
		modules: [indexHandler],
	},
];

// Runtime code (copied from runtime.ts output)
const escapeRegex = /[.+?^${}()|[\]\\]/g;

type RouteHandler = (context: RouteContext) => Response | Promise<Response>;

interface Route {
	routePath: string;
	mountPath: string;
	method: string;
	middlewares: RouteHandler[];
	modules: RouteHandler[];
}

interface RouteContext {
	request: Request;
	functionPath: string;
	next: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
	params: Record<string, string>;
	data: Record<string, unknown>;
	env: Record<string, unknown>;
	waitUntil: (promise: Promise<unknown>) => void;
	passThroughOnException: () => void;
}

function* executeRequest(request: Request, routeList: Route[]) {
	const requestPath = new URL(request.url).pathname;

	// First, iterate through the routes (backwards) and execute "middlewares" on partial route matches
	for (const route of [...routeList].reverse()) {
		if (route.method && route.method !== request.method) {
			continue;
		}

		const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
			end: false,
		});
		const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
			end: false,
		});
		const matchResult = routeMatcher(requestPath);
		const mountMatchResult = mountMatcher(requestPath);
		if (matchResult && mountMatchResult) {
			for (const handler of route.middlewares.flat()) {
				yield {
					handler,
					params: matchResult.params as Record<string, string>,
					path: mountMatchResult.path,
				};
			}
		}
	}

	// Then look for the first exact route match and execute its "modules"
	for (const route of routeList) {
		if (route.method && route.method !== request.method) {
			continue;
		}
		const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
			end: true,
		});
		const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
			end: false,
		});
		const matchResult = routeMatcher(requestPath);
		const mountMatchResult = mountMatcher(requestPath);
		if (matchResult && mountMatchResult && route.modules.length) {
			for (const handler of route.modules.flat()) {
				yield {
					handler,
					params: matchResult.params as Record<string, string>,
					path: matchResult.path,
				};
			}
			break;
		}
	}
}

function createPagesHandler(
	routeList: Route[],
	fallbackService: string | null
) {
	return {
		async fetch(
			originalRequest: Request,
			env: Record<string, unknown>,
			workerContext: ExecutionContext
		) {
			let request = originalRequest;
			const handlerIterator = executeRequest(request, routeList);
			let data: Record<string, unknown> = {};
			let isFailOpen = false;

			const next = async (
				input?: RequestInfo,
				init?: RequestInit
			): Promise<Response> => {
				if (input !== undefined) {
					let url: RequestInfo = input;
					if (typeof input === "string") {
						url = new URL(input, request.url).toString();
					}
					request = new Request(url, init);
				}

				const result = handlerIterator.next();
				if (result.done === false) {
					const { handler, params, path } = result.value;
					const context: RouteContext = {
						request: new Request(request.clone()),
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
				} else if (
					fallbackService &&
					env[fallbackService] &&
					typeof (env[fallbackService] as Fetcher).fetch === "function"
				) {
					const response = await (env[fallbackService] as Fetcher).fetch(
						request
					);
					return cloneResponse(response);
				} else {
					return new Response("Not Found", { status: 404 });
				}
			};

			try {
				return await next();
			} catch (error) {
				if (
					isFailOpen &&
					fallbackService &&
					env[fallbackService] &&
					typeof (env[fallbackService] as Fetcher).fetch === "function"
				) {
					const response = await (env[fallbackService] as Fetcher).fetch(
						request
					);
					return cloneResponse(response);
				}
				throw error;
			}
		},
	};
}

const cloneResponse = (response: Response) =>
	new Response(
		[101, 204, 205, 304].includes(response.status) ? null : response.body,
		response
	);

// Export the handler
export default createPagesHandler(routes, "ASSETS");
