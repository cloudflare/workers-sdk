import { match } from "path-to-regexp";
import { HTTPMethod } from "../routes";
import { EventContext, Params, RequestHandler } from "../public";

type RouteHandler = {
  routePath: string;
  methods: HTTPMethod[];
  modules: RequestHandler[];
  middlewares: RequestHandler[];
};

// inject `routes` via ESBuild
declare const routes: RouteHandler[];

// expect an ASSETS fetcher binding pointing to the asset-server stage
type Env = {
  [name: string]: any;
  ASSETS: { fetch(url: string, init: RequestInit): Promise<Response> };
};

type WorkerContext = {
  waitUntil: (promise: Promise<any>) => void;
};

function* executeRequest(request: Request, env: Env) {
  const requestPath = new URL(request.url).pathname;

  // First, iterate through the routes and execute "middlewares" on partial route matches
  for (const route of routes) {
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

  // Finally, yield to the asset-server
  return {
    handler: () => env.ASSETS.fetch(request.url, request),
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
      if (value) {
        const { handler, params } = value;
        const context: EventContext<any, any> = {
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
      }
    };

    try {
      return next();
    } catch (err) {
      return new Response("Internal Error", { status: 500 });
    }
  },
};
