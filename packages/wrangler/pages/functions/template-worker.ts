import { match } from "path-to-regexp";
import type { HTTPMethod } from "./routes";

/* TODO: Grab these from @cloudflare/workers-types instead */
type Params<P extends string = string> = Record<P, string | string[]>;

type EventContext<Env, P extends string, Data> = {
  request: Request;
  functionPath: string;
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
};

function* executeRequest(request: Request) {
  const requestPath = new URL(request.url).pathname;

  // First, iterate through the routes (backwards) and execute "middlewares" on partial route matches
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }

    const routeMatcher = match(route.routePath, { end: false });
    const mountMatcher = match(route.mountPath, { end: false });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
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

    const routeMatcher = match(route.routePath, { end: true });
    const mountMatcher = match(route.mountPath, { end: false });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
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

export default {
  async fetch(request: Request, env: FetchEnv, workerContext: WorkerContext) {
    const handlerIterator = executeRequest(request);
    const data = {}; // arbitrary data the user can set between functions
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
          request: new Request(request.clone()),
          functionPath: path,
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
          { ...response, headers: new Headers(response.headers) }
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
