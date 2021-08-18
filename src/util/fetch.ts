import fetch, { Headers } from "node-fetch";
import type { Request, Response, HeadersInit, RequestInit } from "node-fetch";
import type WebSocket from "ws";
import type { MessageEvent } from "ws";

/**
 * A `fetch()` function.
 *
 * @link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
 */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Default options for creating a `fetch()` function.
 */
export interface FetchInit {
  /**
   * The host.
   */
  host?: string;
  /**
   * The user agent.
   */
  userAgent?: string;
  /**
   * The header map.
   */
  headers?: HeadersInit;
}

/**
 * Creates a custom `fetch()` function.
 */
export function fetchIt(init: FetchInit = {}): Fetch {
  const { host, headers: headersInit, userAgent } = init;

  return async (input: string, init: RequestInit = {}) => {
    if (input.startsWith("/")) {
      input = `https://${host}${input}`;
    }

    const headers = new Headers(headersInit);
    if (userAgent) {
      headers.set("User-Agent", userAgent);
    }
    for (const [name, value] of new Headers(init.headers).entries()) {
      headers.set(name, value);
    }
    init.headers = headers;

    return fetch(input, init);
  };
}

/**
 * A `fetch()` function that outputs a JSON response.
 */
export type FetchJson = <T>(input: string, init?: RequestInit) => Promise<T>;

/**
 * Creates a custom `fetch()` function for JSON responses.
 */
export function fetchJson(init?: FetchInit): FetchJson {
  const fetch = fetchIt(init);

  return async (input: string, init: RequestInit = {}) => {
    const response = await fetch(input, init);
    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new Error("Expected a JSON response, but instead got: " + text);
    }
  };
}

/**
 * A HTTP server that responds to `fetch()` requests.
 */
export interface FetchServer {
  /**
   * Responds to a request.
   */
  fetch(request: Request): Promise<Response>;
  /**
   * Accepts a websocket connection.
   */
  upgrade?(webSocket: WebSocket): void;
}

/**
 * Creates a proxy bridge between two websockets.
 */
export function proxyWebSocket(
  webSocket: WebSocket,
  otherSocket: WebSocket
): void {
  webSocket.addEventListener("message", (event: MessageEvent) =>
    otherSocket.send(event.data)
  );
  otherSocket.addEventListener("message", (event: MessageEvent) =>
    webSocket.send(event.data)
  );

  // Some close codes are marked as 'reserved' and will throw an error if used.
  // Therefore, it's not worth the effort to passthrough the close code and reason.
  webSocket.addEventListener("close", () => otherSocket.close());
  otherSocket.addEventListener("close", () => webSocket.close());
}
