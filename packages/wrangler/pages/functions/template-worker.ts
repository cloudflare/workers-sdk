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
};

function* executeRequest(request: Request, _env: FetchEnv) {
  const requestPath = new URL(request.url).pathname;

  // First, iterate through the routes (backwards) and execute "middlewares" on partial route matches
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
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
    if (route.method && route.method !== request.method) {
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
}

export default {
  async fetch(request: Request, env: FetchEnv, workerContext: WorkerContext) {
    const handlerIterator = executeRequest(request, env);
    const data = {}; // arbitrary data the user can set between functions
    const next = async (input?: RequestInfo, init?: RequestInit) => {
      if (input !== undefined) {
        request = new Request(input, init);
      }

      const result = handlerIterator.next();
      // Note we can't use `!result.done` because this doesn't narrow to the correct type
      if (result.done == false) {
        const { handler, params } = result.value;
        const context = {
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
      } else if (__FALLBACK_SERVICE__) {
        // There are no more handlers so finish with the fallback service (`env.ASSETS.fetch` in Pages' case)
        return env[__FALLBACK_SERVICE__].fetch(request);
      } else {
        // There was not fallback service so actually make the request to the origin.
        return fetch(request);
      }
    };

    try {
      return next();
    } catch (err) {
      return new Response("Internal Error", { status: 500 });
    }
  },
};
