import { match } from "path-to-regexp";
import type { HTTPMethod } from "./routes";

/* TODO: Grab these from @cloudflare/workers-types instead */
type Params<P extends string = string> = Record<P, string | string[]>;

type EventContext<Env, P extends string, Data> = {
  request: Request;
  waitUntil: (promise: Promise<unknown>) => void;
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
  methods: HTTPMethod[];
  modules: PagesFunction[];
  middlewares: PagesFunction[];
};

// inject `routes` via ESBuild
declare const routes: RouteHandler[];
// define `__FALLBACK_SERVICE__` via ESBuild
declare const __FALLBACK_SERVICE__: string;

// expect an ASSETS fetcher binding pointing to the asset-server stage
type Env = {
  [name: string]: unknown;
  ASSETS: { fetch(url: string, init: RequestInit): Promise<Response> };
};

type WorkerContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `env` can be used by __FALLBACK_SERVICE_FETCH__
function* executeRequest(request: Request, env: Env) {
  const requestPath = new URL(request.url).pathname;

  // First, iterate through the routes (backwards) and execute "middlewares" on partial route matches
  for (const route of [...routes].reverse()) {
    if (
      route.methods.length &&
      !route.methods.includes(request.method as HTTPMethod)
    ) {
      continue;
    }

    const routeMatcher = match(route.routePath, { end: false });
    const matchResult = routeMatcher(requestPath);
    if (matchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params as Params,
        };
      }
    }
  }

  // Then look for the first exact route match and execute its "modules"
  for (const route of routes) {
    if (
      route.methods.length &&
      !route.methods.includes(request.method as HTTPMethod)
    ) {
      continue;
    }

    const routeMatcher = match(route.routePath, { end: true });
    const matchResult = routeMatcher(requestPath);
    if (matchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params as Params,
        };
      }
      break;
    }
  }

  // Finally, yield to the fallback service (`env.ASSETS.fetch` in Pages' case)
  return {
    handler: () =>
      __FALLBACK_SERVICE__
        ? // @ts-expect-error expecting __FALLBACK_SERVICE__ to be the name of a service binding, so fetch should be defined
          env[__FALLBACK_SERVICE__].fetch(request)
        : fetch(request),
    params: {} as Params,
  };
}

export default {
  async fetch(request: Request, env: Env, workerContext: WorkerContext) {
    const handlerIterator = executeRequest(request, env);
    const data = {}; // arbitrary data the user can set between functions
    const next = async (input?: RequestInfo, init?: RequestInit) => {
      if (input !== undefined) {
        request = new Request(input, init);
      }

      const { value } = handlerIterator.next();
      const { handler, params } = value;
      const context: EventContext<unknown, string, Record<string, unknown>> = {
        request: new Request(request.clone()),
        next,
        params,
        data,
        env,
        waitUntil: workerContext.waitUntil.bind(workerContext),
      };

      const response = await handler(context);

      // https://fetch.spec.whatwg.org/#null-body-status
      return new Response(
        [101, 204, 205, 304].includes(response.status) ? null : response.body,
        response
      );
    };

    try {
      return next();
    } catch (err) {
      return new Response("Internal Error", { status: 500 });
    }
  },
};
