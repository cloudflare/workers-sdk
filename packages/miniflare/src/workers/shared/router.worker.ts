import { Awaitable } from "./types";

export class HttpError extends Error {
	constructor(
		readonly code: number,
		message?: string
	) {
		super(message);
		// Restore prototype chain:
		// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
		Object.setPrototypeOf(this, new.target.prototype);
		this.name = `${new.target.name} [${code}]`;
	}

	toResponse(): Response {
		return new Response(this.message, {
			status: this.code,
			// Custom statusMessage is required for runtime error messages
			statusText: this.message.substring(0, 512),
		});
	}
}

type MethodRouteMap = Map<string, (readonly [RegExp, PropertyKey])[]>;

const kRoutesTemplate = Symbol("kRoutesTemplate");

export abstract class Router {
	// Routes added by @METHOD decorators
	#routes?: MethodRouteMap;

	constructor() {
		// Initialise `#routes` from subclass's prototype
		this.#routes = (new.target.prototype as RouterPrototype)[kRoutesTemplate];
	}

	async fetch(req: Request<unknown, unknown>) {
		const url = new URL(req.url);
		const methodRoutes = this.#routes?.get(req.method);
		if (methodRoutes === undefined) return new Response(null, { status: 405 });
		const handlers = this as unknown as Record<PropertyKey, RouteHandler>;
		try {
			for (const [path, key] of methodRoutes) {
				const match = path.exec(url.pathname);
				if (match !== null) return await handlers[key](req, match.groups, url);
			}
			return new Response(null, { status: 404 });
		} catch (e) {
			if (e instanceof HttpError) {
				return e.toResponse();
			}
			throw e;
		}
	}
}

// Prototype of a `Router` subclass, @METHOD decorators will add routes to this
export type RouterPrototype = typeof Router.prototype & {
	[kRoutesTemplate]?: MethodRouteMap;
};

export type RouteHandler<Params = unknown, Cf = unknown> = (
	req: Request<unknown, Cf>,
	params: Params,
	url: URL
) => Awaitable<Response>;

function pathToRegexp(path?: string): RegExp {
	if (path === undefined) return /^.*$/;
	// Optionally allow trailing slashes
	if (!path.endsWith("/")) path += "/?";
	// Escape forward slashes
	path = path.replace(/\//g, "\\/");
	// Replace `:key` with named capture groups
	path = path.replace(/:(\w+)/g, "(?<$1>[^\\/]+)");
	// Return RegExp, asserting start and end of line
	return new RegExp(`^${path}$`);
}

const createRouteDecorator =
	(method: string) =>
	(path?: string) =>
	(prototype: RouterPrototype, key: PropertyKey) => {
		const route = [pathToRegexp(path), key] as const;
		const routes = (prototype[kRoutesTemplate] ??= new Map());
		const methodRoutes = routes.get(method);
		if (methodRoutes) methodRoutes.push(route);
		else routes.set(method, [route]);
	};

export const GET = createRouteDecorator("GET");
export const HEAD = createRouteDecorator("HEAD");
export const POST = createRouteDecorator("POST");
export const PUT = createRouteDecorator("PUT");
export const DELETE = createRouteDecorator("DELETE");
export const PURGE = createRouteDecorator("PURGE");
export const PATCH = createRouteDecorator("PATCH");
