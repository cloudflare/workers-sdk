import { Router } from "itty-router";
import { TUNNEL_TTL_SECONDS } from "./constants";

export type TunnelCreationRequest = {
  sessionUrl: string;
};

export type TunnelCreationResponse = {
  id: string;
  url: string;
};

export type TunnelHeartbeatRequest = {
  id: string;
};

export type TunnelShutdownRequest = TunnelHeartbeatRequest;

/**
 * Routes for interacting with the dev-tunnel worker
 */
// eslint has trouble with enums, it thinks we're shadowing for some reason
// eslint-disable-next-line no-shadow
export enum Routes {
  /**
   * Creates a new tunnel.
   * Expects a `POST` request with a JSON body
   * containing a stringified `TunnelCreationRequestBody`
   */
  CREATE = "/create",

  /**
   * Sends a heartbeat to keep an existing tunnel alive.
   * Expects a `PATCH` request with a JSON body
   * containing a stringified `TunnelHeartbeatRequestBody`
   */
  HEARTBEAT = "/heartbeat",

  /**
   * Shuts down a tunnel.
   * Expects a `DELETE` request with a JSON body
   * containing a stringified `TunnelShutdownRequestBody`
   */
  SHUTDOWN = "/shutdown",

  /**
   * All other requests are treated as proxy requests
   * that should be forwarded to a dev session.
   */
  PROXY = "*",
}

type Env = {
  TUNNELS: KVNamespace;
};

const router = Router();

// handle tunnel creation requests
router.post(Routes.CREATE, async (request: Request, env: Env) => {
  try {
    const { sessionUrl } = await request.json<TunnelCreationRequest>();
    const id = crypto.randomUUID();

    await env.TUNNELS.put(id, sessionUrl, {
      expirationTtl: TUNNEL_TTL_SECONDS,
    });

    const { hostname } = new URL(request.url);

    const body: TunnelCreationResponse = {
      id,
      url: `https://${hostname}/${id}`,
    };

    return new Response(JSON.stringify(body), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response("Invalid request", { status: 400 });
  }
});

// handle tunnel heartbeat requests
router.patch(Routes.HEARTBEAT, async (request: Request, env: Env) => {
  try {
    const { id } = await request.json<TunnelHeartbeatRequest>();

    const host = await env.TUNNELS.get(id);
    if (!host) {
      return new Response(`No tunnel found with id ${id}`, {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    await env.TUNNELS.put(id, host, {
      expirationTtl: TUNNEL_TTL_SECONDS,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response("Invalid request", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
});

// handle tunnel shutdown requests
router.delete(Routes.SHUTDOWN, async (request: Request, env: Env) => {
  try {
    const { id } = await request.json<TunnelShutdownRequest>();
    await env.TUNNELS.delete(id);

    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response("Invalid request", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
});

// handle proxy requests
router.all(Routes.PROXY, async (request: Request, env: Env) => {
  try {
    const { hostId, path } = extractComponents(request.url);

    const host = await env.TUNNELS.get(hostId);
    if (!host) {
      return new Response(`No tunnel registered at ${hostId}`, {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return await fetch(`${host}${path}`, request);
  } catch (e) {
    return new Response("Invalid request.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
});

export default {
  fetch: router.handle,
};

/**
 * Extract the host ID and "path" (not really the path in the true sense,
 * but basically everything in the URL that comes after the host) from
 * the URL of a request coming in to the proxy worker.
 *
 * Throws if it fails to extract a host ID
 */
export function extractComponents(url: string) {
  const firstSlashIndex = url.indexOf("/", "https://".length);
  if (firstSlashIndex < 0) {
    throw new Error('Couldn\'t find "/" character');
  }

  const afterSlash = url.substring(firstSlashIndex + 1);
  const secondSlashIndex = afterSlash.indexOf("/");

  const hostId =
    secondSlashIndex === -1
      ? afterSlash
      : afterSlash.substring(0, secondSlashIndex);

  const path =
    secondSlashIndex === -1 ? "" : afterSlash.substring(secondSlashIndex);
  return { hostId, path };
}
