import { connect } from "node:http2";
import { createServer } from "node:http";
import type {
  Server,
  IncomingHttpHeaders,
  OutgoingHttpHeaders,
  RequestListener,
} from "node:http";
import WebSocket from "faye-websocket";
import serveStatic from "serve-static";

export interface HttpProxyInit {
  host: string;
  assetPath?: string | null;
  onRequest?: (headers: IncomingHttpHeaders) => void;
  onResponse?: (headers: OutgoingHttpHeaders) => void;
}

/**
 * Creates a HTTP/1 proxy that sends requests over HTTP/2.
 */
export function createHttpProxy(init: HttpProxyInit): Server {
  const { host, assetPath, onRequest = () => {}, onResponse = () => {} } = init;
  const remote = connect(`https://${host}`);
  const local = createServer();
  // HTTP/2 -> HTTP/2
  local.on("stream", (stream, headers: IncomingHttpHeaders) => {
    onRequest(headers);
    headers[":authority"] = host;
    const request = stream.pipe(remote.request(headers));
    request.on("response", (headers: OutgoingHttpHeaders) => {
      onResponse(headers);
      stream.respond(headers);
      request.pipe(stream, { end: true });
    });
  });
  // HTTP/1 -> HTTP/2
  const handleRequest: RequestListener = (message, response) => {
    const { httpVersionMajor, headers, method, url } = message;
    if (httpVersionMajor >= 2) {
      return; // Already handled by the "stream" event.
    }
    onRequest(headers);
    headers[":method"] = method;
    headers[":path"] = url;
    headers[":authority"] = host;
    headers[":scheme"] = "https";
    for (const name of Object.keys(headers)) {
      if (HTTP1_HEADERS.has(name.toLowerCase())) {
        delete headers[name];
      }
    }
    const request = message.pipe(remote.request(headers));
    request.on("response", (headers) => {
      const status = headers[":status"];
      onResponse(headers);
      for (const name of Object.keys(headers)) {
        if (name.startsWith(":")) {
          delete headers[name];
        }
      }
      response.writeHead(status, headers);
      request.pipe(response, { end: true });
    });
  };
  // If an asset path is defined, check the file system
  // for a file first and serve if it exists.
  if (assetPath) {
    const handleAsset = serveStatic(assetPath, {
      cacheControl: false,
    });
    local.on("request", (request, response) => {
      handleAsset(request, response, () => {
        handleRequest(request, response);
      });
    });
  } else {
    local.on("request", handleRequest);
  }
  // HTTP/1 -> WebSocket (over HTTP/1)
  local.on("upgrade", (message, socket, body) => {
    const { headers, url } = message;
    onRequest(headers);
    headers["host"] = host;
    const local = new WebSocket(message, socket, body);
    // TODO(soon): Custom WebSocket protocol is not working?
    const remote = new WebSocket.Client(`wss://${host}${url}`, [], { headers });
    local.pipe(remote).pipe(local);
  });
  remote.on("close", () => {
    local.close();
  });
  return local;
}

const HTTP1_HEADERS = new Set([
  "host",
  "connection",
  "upgrade",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "http2-settings",
]);
