import { Request, Response } from "undici";
import { Awaitable, Log } from "../../shared";
import { GatewayFactory } from "./gateway";

export type RouteHandler<Params = unknown> = (
	req: Request,
	params: Params,
	url: URL
) => Awaitable<Response>;

export abstract class Router<Gateway> {
	// Routes added by @METHOD decorators
	routes?: Map<string, (readonly [RegExp, string | symbol])[]>;

	constructor(
		protected readonly log: Log,
		protected readonly gatewayFactory: GatewayFactory<Gateway>
	) {
		// Make sure this.routes isn't undefined and has the prototype's value
		this.routes = new.target.prototype.routes;
	}

	async route(req: Request, url?: URL): Promise<Response | undefined> {
		url ??= new URL(req.url);
		const methodRoutes = this.routes?.get(req.method);
		if (methodRoutes !== undefined) {
			for (const [path, key] of methodRoutes) {
				const match = path.exec(url.pathname);
				if (match !== null) {
					return (this as unknown as Record<string | symbol, RouteHandler>)[
						key
					](req, match.groups, url);
				}
			}
		}
	}
}

export interface RouterConstructor<Gateway> {
	new (log: Log, gatewayFactory: GatewayFactory<Gateway>): Router<Gateway>;
}

function pathToRegexp(path: string): RegExp {
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
	(path: string) =>
	(prototype: typeof Router.prototype, key: string | symbol) => {
		const route = [pathToRegexp(path), key] as const;
		const routes = (prototype.routes ??= new Map<
			string,
			(readonly [RegExp, string | symbol])[]
		>());
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
