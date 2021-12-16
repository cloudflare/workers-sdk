import { Response, Request, Headers } from "node-fetch";
import type { MessageEvent } from "ws";
import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage, ServerResponse } from "http";
import { createServer } from "http";

/**
 * A call frame.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#type-CallFrame
 */
export interface DtCallFrame {
  /**
   * The module path.
   *
   * @example
   * 'worker.js'
   */
  url: string;
  /**
   * The function name.
   */
  functionName?: string;
  /**
   * The line number. (0-based)
   */
  lineNumber: number;
  /**
   * The column number. (0-based)
   */
  columnNumber: number;
}

/**
 * A stack trace.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#type-StackTrace
 */
export interface DtStackTrace {
  /**
   * A description of the stack, only present in certain contexts.
   */
  description?: string;
  /**
   * The call frames.
   */
  callFrames: DtCallFrame[];
  /**
   * The parent stack trace.
   */
  parent?: DtStackTrace;
}

/**
 * A JavaScript object type.
 */
export type DtRemoteObjectType =
  | "object"
  | "function"
  | "undefined"
  | "string"
  | "number"
  | "boolean"
  | "symbol"
  | "bigint";

/**
 * A view of a remote JavaScript object.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#type-RemoteObject
 */
export interface DtRemoteObject<T> {
  /**
   * The object type.
   *
   * @example
   * 'string'
   */
  type: DtRemoteObjectType;
  /**
   * The specific object type, if the type is `object`.
   *
   * @example
   * 'arraybuffer'
   */
  subtype?: string;
  /**
   * The class name, if the type if `object`.
   */
  className?: string;
  /**
   * The object as a string.
   *
   * @example
   * 'Array(1)'
   * 'TypeError: Oops!\n    at worker.js:5:15'
   */
  description?: string;
  /**
   * The object.
   */
  value?: T;
  // TODO(soon): add a preview field for more complex types
}

/**
 * An event when `console.log()` is invoked.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#event-consoleAPICalled
 */
export interface DtLogEvent {
  timestamp: number;
  type: string;
  args: DtRemoteObject<unknown>[];
  stackTrace?: DtStackTrace;
}

/**
 * An event when an uncaught `Error` is thrown.
 *
 * @link https://chromedevtools.github.io/devtools-protocol/1-3/Runtime/#event-exceptionThrown
 */
export interface DtExceptionEvent {
  timestamp: number;
  exceptionDetails: {
    lineNumber: number;
    columnNumber: number;
    exception: DtRemoteObject<Error>;
    stackTrace: DtStackTrace;
  };
}

/**
 * A DevTools event.
 */
export type DtEvent = DtLogEvent | DtExceptionEvent;

/**
 * A listener that receives DevTools events.
 */
export type DtListener = (event: DtEvent) => void;

/**
 * A DevTools inspector that listens to logs and debug events from a Worker.
 *
 * @example
 * const worker: CfWorker
 * const inspector: DtInspector = await worker.inspect()
 *
 * @link https://chromedevtools.github.io/devtools-protocol/
 */
export class DtInspector {
  #webSocket: WebSocket;
  #keepAlive?: NodeJS.Timer;

  constructor(url: string) {
    // this.#events = [];
    // this.#listeners = [];
    this.#webSocket = new WebSocket(url);
    this.#webSocket.onopen = () => {
      this.enable();
    };
    this.#webSocket.onclose = () => {
      this.disable();
    };
    this.#webSocket.on("unexpected-response", () => {
      console.log("504??"); // TODO: refactor this class to start again
    });
    this.#webSocket.onmessage = (event: MessageEvent) => {
      // TODO: this seems unnecessary, unless we're planning
      // on logging to console. We'll see.
      if (typeof event.data === "string") {
        // this.recv(JSON.parse(event.data));
      } else {
        // ??
      }
    };
  }

  /**
   * Exposes a websocket proxy on a localhost port.
   */
  proxyTo(port: number): AbortController {
    return bind(new DtInspectorBridge(this.#webSocket, port), port);
  }

  /**
   * If the inspector is closed.
   */
  get closed(): boolean {
    return this.#webSocket.readyState === WebSocket.CLOSED;
  }

  /**
   * Closes the inspector.
   */
  close(): void {
    if (!this.closed) {
      try {
        this.#webSocket.close();
      } catch (err) {
        // Closing before the websocket is ready will throw an error.
      }
    }
    // this.#events = [];
  }

  private send(event: Record<string, unknown>): void {
    if (!this.closed) {
      this.#webSocket.send(JSON.stringify(event));
    }
  }

  private enable(): void {
    let id = 1;
    this.send({ method: "Runtime.enable", id });
    this.#keepAlive = setInterval(() => {
      this.send({ method: "Runtime.getIsolateId", id: id++ });
    }, 10_000);
  }

  private disable(): void {
    if (this.#keepAlive) {
      clearInterval(this.#keepAlive);
      this.#keepAlive = undefined;
    }
  }
}

/**
 * A HTTP server that responds to `fetch()` requests.
 */
interface FetchServer {
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
 * A bridge between a remote DevTools inspector and Chrome.
 *
 * Exposes a localhost HTTP server that responds to informational requests
 * from Chrome about the DevTools inspector. Then, when it receives a
 * WebSocket upgrade, forwards the connection to the remote inspector.
 */
class DtInspectorBridge implements FetchServer {
  #webSocket: WebSocket;
  #localPort: number;
  #connected: boolean;

  constructor(webSocket: WebSocket, localPort?: number) {
    this.#webSocket = webSocket;
    this.#localPort = localPort;
    this.#connected = false;
  }

  async fetch(request: Request): Promise<Response> {
    const { url } = request;
    const { pathname } = new URL(url);
    switch (pathname) {
      case "/json/version":
        return this.version;
      case "/json":
      case "/json/list":
        return this.location;
      default:
        break;
    }
    return new Response("Not Found", { status: 404 });
  }

  upgrade(webSocket: WebSocket): void {
    if (this.#connected) {
      webSocket.close(
        1013,
        "Too many clients; only one can be connected at a time"
      );
    } else {
      this.#connected = true;
      webSocket.addEventListener("close", () => (this.#connected = false));
      proxyWebSocket(webSocket, this.#webSocket);
    }
  }

  private get version(): Response {
    const headers = { "Content-Type": "application/json" };
    const body = {
      Browser: "workers-run/v0.0.0", // TODO: this should pick up version from package.json
      // TODO: (someday): The DevTools protocol should match that of edgeworker.
      // This could be exposed by the preview API.
      "Protocol-Version": "1.3",
    };
    return new Response(JSON.stringify(body), { headers });
  }

  private get location(): Response {
    const headers = { "Content-Type": "application/json" };
    const localHost = `localhost:${this.#localPort}/ws`;
    const devtoolsFrontendUrl = `devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=${localHost}`;
    const devtoolsFrontendUrlCompat = `devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${localHost}`;
    const body = [
      {
        id: randomId(),
        type: "node",
        description: "workers",
        webSocketDebuggerUrl: `ws://${localHost}`,
        devtoolsFrontendUrl,
        devtoolsFrontendUrlCompat,
        // Below are fields that are visible in the DevTools UI.
        title: "Cloudflare Worker",
        faviconUrl: "https://workers.cloudflare.com/favicon.ico",
        url: "https://" + new URL(this.#webSocket.url).host,
      },
    ];
    return new Response(JSON.stringify(body), { headers });
  }
}

function bind(fetcher: FetchServer, port?: number): AbortController {
  const controller = new AbortController();

  const server = createServer(
    (input: IncomingMessage, output: ServerResponse) =>
      toRequest(input)
        .then((request) => fetcher.fetch(request))
        .then((response) => toResponse(response, output))
        .catch((error) => console.error(error))
  );

  if (fetcher.upgrade) {
    const webSocket = new WebSocketServer({ server });
    webSocket.on("connection", (ws: WebSocket) => fetcher.upgrade(ws));
  }

  const socket = server.listen({ port });
  controller.signal.onabort = () => {
    server.close();
    socket.close();
  };
  return controller;
}

/**
 * Converts a Node.js request to a Web standard `Request`.
 */
async function toRequest(request: IncomingMessage): Promise<Request> {
  const host = request.headers.host ?? "localhost";
  const { href } = new URL(request.url, "http://" + host);

  const { rawHeaders, method } = request;
  const headers = new Headers();
  for (let i = 0; i < rawHeaders.length; i += 2) {
    headers.append(rawHeaders[i], rawHeaders[i + 1]);
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", (error) => reject(error));
    request.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const body = buffer.length === 0 ? undefined : buffer;
      resolve(new Request(href, { method, headers, body }));
    });
  });
}

/**
 * Converts a Web standard `Response` into a Node.js response.
 */
async function toResponse(
  input: Response,
  response: ServerResponse
): Promise<void> {
  const { status, statusText, headers, body: hasBody } = input;

  for (const [name, value] of headers.entries()) {
    response.setHeader(name, value);
  }

  let body: Uint8Array;
  if (hasBody) {
    body = new Uint8Array(await input.arrayBuffer());
    response.setHeader("Content-Length", body.byteLength);
  }

  response.writeHead(status, statusText);
  response.write(body);
}

/**
 * Creates a proxy bridge between two websockets.
 */
function proxyWebSocket(webSocket: WebSocket, otherSocket: WebSocket): void {
  webSocket.addEventListener("message", (event: MessageEvent) => {
    try {
      otherSocket.send(event.data);
    } catch (e) {
      if (e.message !== "WebSocket is not open: readyState 0 (CONNECTING)") {
        // this just means we haven't opened a websocket yet
        // usually happens until there's at least one request
        // which is weird, because we may miss something that happens on
        // the first request
        console.error(e);
      }
    }
  });
  otherSocket.addEventListener("message", (event: MessageEvent) =>
    webSocket.send(event.data)
  );

  // Some close codes are marked as 'reserved' and will throw an error if used.
  // Therefore, it's not worth the effort to passthrough the close code and reason.
  webSocket.addEventListener("close", () => otherSocket.close());
  otherSocket.addEventListener("close", () => webSocket.close());
}

// Credit: https://stackoverflow.com/a/2117523
function randomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
