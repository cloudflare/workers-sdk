/**
 * Test worker for runtime tests.
 *
 * This worker re-implements the runtime shipped in `src/runtime.ts` but binds
 * it to handlers imported directly from the `basic-project` fixture. The goal
 * is that any change to a fixture response body or header must be reflected in
 * the assertions in `runtime.test.ts` (and vice versa), so the fixture files
 * act as the real source of truth for route handlers.
 *
 * The runtime itself is generated as a string in `src/runtime.ts` and inlined
 * into `compileFunctions()` output. End-to-end codegen is covered by
 * `compile.test.ts`; this file exercises the same runtime logic in workerd so
 * we can assert on actual request/response behaviour.
 */

import { match } from "path-to-regexp";
import { onRequest as middleware } from "../fixtures/basic-project/functions/_middleware";
import {
	onRequestGet as apiIdGet,
	onRequestPut as apiIdPut,
} from "../fixtures/basic-project/functions/api/[id]";
import {
	onRequestGet as apiHelloGet,
	onRequestPost as apiHelloPost,
} from "../fixtures/basic-project/functions/api/hello";
import { onRequest as indexHandler } from "../fixtures/basic-project/functions/index";

// Route configuration mirroring what codegen would produce for the fixture.
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

// Runtime code mirrors the output of `src/runtime.ts#generateRuntimeCode`.
// Keep these implementations in sync when tweaking runtime behaviour.
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

export default createPagesHandler(routes, "ASSETS");
