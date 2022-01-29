import { connect } from "node:http2";
import type { ClientHttp2Session, ServerHttp2Stream } from "node:http2";
import { createServer } from "node:http";
import type {
  IncomingHttpHeaders,
  RequestListener,
  IncomingMessage,
  ServerResponse,
  Server,
} from "node:http";
import WebSocket from "faye-websocket";
import serveStatic from "serve-static";
import type { CfPreviewToken } from "./api/preview";
import { useEffect, useRef, useState } from "react";

/**
 * `usePreviewServer` is a React hook that creates a local development
 * server that can be used to develop a Worker.
 *
 * When we run `wrangler dev`, we start by uploading the compiled worker
 * to the preview service, which responds with a preview token.
 * (see `useWorker`/`createWorker` for details.)
 * We can then use that token to connect to the preview server for a
 * great local development experience. Further, as we change the worker,
 * we can update the preview token transparently without having to restart
 * the development server.
 */

/** Rewrite request headers to add the preview token. */
function addCfPreviewTokenHeader(
  headers: IncomingHttpHeaders,
  previewTokenValue: string
) {
  headers["cf-workers-preview-token"] = previewTokenValue;
}

/**
 * Rewrite references in request headers
 * from the preview host to the local host.
 */
function rewriteRemoteHostToLocalHostInHeaders(
  headers: IncomingHttpHeaders,
  remoteHost: string,
  localPort: number
) {
  for (const [name, value] of Object.entries(headers)) {
    // Rewrite the remote host to the local host.
    if (typeof value === "string" && value.includes(remoteHost)) {
      headers[name] = value
        .replaceAll(`https://${remoteHost}`, `http://localhost:${localPort}`)
        .replaceAll(remoteHost, `localhost:${localPort}`);
    }
  }
}

export function usePreviewServer({
  previewToken,
  publicRoot,
  port,
}: {
  previewToken: CfPreviewToken | undefined;
  publicRoot: undefined | string;
  port: number;
}) {
  /** Creates an HTTP/1 proxy that sends requests over HTTP/2. */
  const proxyServer = useRef<Server>();
  const proxy = (proxyServer.current ??= createProxyServer());

  /**
   * When we're not connected / getting a fresh token on changes,
   * we'd like to buffer streams/requests until we're connected.
   * Once connected, we can flush the buffered streams/requests.
   * streamBufferRef is used to buffer http/2 streams, while
   * requestResponseBufferRef is used to buffer http/1 requests.
   */
  const streamBufferRef = useRef<
    { stream: ServerHttp2Stream; headers: IncomingHttpHeaders }[]
  >([]);
  const requestResponseBufferRef = useRef<
    { request: IncomingMessage; response: ServerResponse }[]
  >([]);

  /**
   * The session doesn't last forever, and will evetually drop
   * (usually within 5-15 minutes). When that happens, we simply
   * restart the effect, effectively restarting the server. We use
   * a state sigil as an effect dependency to do so.
   */
  const [retryServerSetupSigil, setRetryServerSetupSigil] = useState<number>(0);
  function retryServerSetup() {
    setRetryServerSetupSigil((x) => x + 1);
  }

  useEffect(() => {
    // If we don't have a token, that means either we're just starting up,
    // or we're refreshing the token.
    if (!previewToken) {
      const cleanupListeners: (() => void)[] = [];
      const bufferStream = (
        stream: ServerHttp2Stream,
        headers: IncomingHttpHeaders
      ) => {
        // store the stream in a buffer so we can replay it later
        streamBufferRef.current.push({ stream, headers });
      };
      proxy.on("stream", bufferStream);
      cleanupListeners.push(() => proxy.off("stream", bufferStream));

      const bufferRequestResponse = (
        request: IncomingMessage,
        response: ServerResponse
      ) => {
        // store the request and response in a buffer so we can replay it later
        requestResponseBufferRef.current.push({ request, response });
      };

      proxy.on("request", bufferRequestResponse);
      cleanupListeners.push(() => proxy.off("request", bufferRequestResponse));
      return () => {
        cleanupListeners.forEach((cleanup) => cleanup());
      };
    }

    // We have a token. Let's proxy requests to the preview end point.
    const cleanupListeners: (() => void)[] = [];

    const assetPath = typeof publicRoot === "string" ? publicRoot : null;

    // create a ClientHttp2Session
    const remote = connect(`https://${previewToken.host}`);
    cleanupListeners.push(() => remote.destroy());

    // As mentioned above, the session may die at any point,
    // so we need to restart the effect.
    remote.on("close", retryServerSetup);
    cleanupListeners.push(() => remote.off("close", retryServerSetup));

    /** HTTP/2 -> HTTP/2  */
    const handleStream = createStreamHandler(previewToken, remote, port);
    proxy.on("stream", handleStream);
    cleanupListeners.push(() => proxy.off("stream", handleStream));

    // flush and replay buffered streams
    streamBufferRef.current.forEach((buffer) =>
      handleStream(buffer.stream, buffer.headers)
    );
    streamBufferRef.current = [];

    /** HTTP/1 -> HTTP/2  */
    const handleRequest: RequestListener = (
      message: IncomingMessage,
      response: ServerResponse
    ) => {
      const { httpVersionMajor, headers, method, url } = message;
      if (httpVersionMajor >= 2) {
        return; // Already handled by the "stream" event.
      }
      addCfPreviewTokenHeader(headers, previewToken.value);
      headers[":method"] = method;
      headers[":path"] = url;
      headers[":authority"] = previewToken.host;
      headers[":scheme"] = "https";
      for (const name of Object.keys(headers)) {
        if (HTTP1_HEADERS.has(name.toLowerCase())) {
          delete headers[name];
        }
      }
      const request = message.pipe(remote.request(headers));
      request.on("response", (responseHeaders) => {
        const status = responseHeaders[":status"] ?? 500;
        rewriteRemoteHostToLocalHostInHeaders(
          responseHeaders,
          previewToken.host,
          port
        );
        for (const name of Object.keys(responseHeaders)) {
          if (name.startsWith(":")) {
            delete responseHeaders[name];
          }
        }
        response.writeHead(status, responseHeaders);
        request.pipe(response, { end: true });
      });
    };

    // If an asset path is defined, check the file system
    // for a file first and serve if it exists.
    const actualHandleRequest = assetPath
      ? createHandleAssetsRequest(assetPath, handleRequest)
      : handleRequest;

    proxy.on("request", actualHandleRequest);
    cleanupListeners.push(() => proxy.off("request", actualHandleRequest));

    // flush and replay buffered requests
    requestResponseBufferRef.current.forEach(({ request, response }) =>
      actualHandleRequest(request, response)
    );
    requestResponseBufferRef.current = [];

    /** HTTP/1 -> WebSocket (over HTTP/1)  */
    const handleUpgrade = (
      message: IncomingMessage,
      socket: WebSocket,
      body: Buffer
    ) => {
      const { headers, url } = message;
      addCfPreviewTokenHeader(headers, previewToken.value);
      headers["host"] = previewToken.host;
      const localWebsocket = new WebSocket(message, socket, body);
      // TODO(soon): Custom WebSocket protocol is not working?
      const remoteWebsocketClient = new WebSocket.Client(
        `wss://${previewToken.host}${url}`,
        [],
        { headers }
      );
      localWebsocket.pipe(remoteWebsocketClient).pipe(localWebsocket);
      // We close down websockets whenever we refresh the token.
      cleanupListeners.push(() => {
        localWebsocket.destroy();
        remoteWebsocketClient.destroy();
      });
    };
    proxy.on("upgrade", handleUpgrade);
    cleanupListeners.push(() => proxy.off("upgrade", handleUpgrade));

    return () => {
      cleanupListeners.forEach((cleanup) => cleanup());
    };
  }, [
    previewToken,
    publicRoot,
    port,
    proxy,
    // We use a state value as a sigil to trigger reconnecting the server.
    // It's not used inside the effect, so react-hooks/exhaustive-deps
    // doesn't complain if it's not included in the dependency array.
    // But its presence is critical, so Do NOT remove it from the dependency list.
    retryServerSetupSigil,
  ]);

  // Start/stop the server whenever the
  // containing component is mounted/unmounted.
  useEffect(() => {
    waitForPortToBeAvailable(port, { retryPeriod: 200, timeout: 2000 })
      .then(() => {
        proxy.listen(port);
        console.log(`⬣ Listening at http://localhost:${port}`);
      })
      .catch((err) => {
        console.error(`⬣ Failed to start server: ${err}`);
      });

    return () => {
      proxy.close();
    };
  }, [port, proxy]);
}

function createHandleAssetsRequest(
  assetPath: string,
  handleRequest: RequestListener
) {
  const handleAsset = serveStatic(assetPath, {
    cacheControl: false,
  });
  return (request: IncomingMessage, response: ServerResponse) => {
    handleAsset(request, response, () => {
      handleRequest(request, response);
    });
  };
}

/** A Set of headers we want to remove from HTTP/1 requests. */
const HTTP1_HEADERS = new Set([
  "host",
  "connection",
  "upgrade",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "http2-settings",
]);

function createProxyServer() {
  return createServer()
    .on("request", function (req, res) {
      // log all requests
      console.log(
        new Date().toLocaleTimeString(),
        req.method,
        req.url,
        res.statusCode
      );
    })
    .on("upgrade", (req) => {
      // log all websocket connections
      console.log(
        new Date().toLocaleTimeString(),
        req.method,
        req.url,
        101,
        "(WebSocket)"
      );
    })
    .on("error", (err) => {
      // log all connection errors
      console.error(new Date().toLocaleTimeString(), err);
    });
}

function createStreamHandler(
  previewToken: CfPreviewToken,
  remote: ClientHttp2Session,
  port: number
) {
  return function handleStream(
    stream: ServerHttp2Stream,
    headers: IncomingHttpHeaders
  ) {
    addCfPreviewTokenHeader(headers, previewToken.value);
    headers[":authority"] = previewToken.host;
    const request = stream.pipe(remote.request(headers));
    request.on("response", (responseHeaders: IncomingHttpHeaders) => {
      rewriteRemoteHostToLocalHostInHeaders(
        responseHeaders,
        previewToken.host,
        port
      );
      stream.respond(responseHeaders);
      request.pipe(stream, { end: true });
    });
  };
}

/**
 * A helper function that waits for a port to be available.
 */
export async function waitForPortToBeAvailable(
  port: number,
  options: { retryPeriod: number; timeout: number }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for port ${port}`));
    }, options.timeout);

    function checkPort() {
      // Testing whether a port is 'available' involves simply
      // trying to make a server listen on that port, and retrying
      // until it succeeds.
      const server = createServer();
      server.on("error", (err) => {
        // @ts-expect-error non standard property on Error
        if (err.code === "EADDRINUSE") {
          setTimeout(checkPort, options.retryPeriod);
        } else {
          reject(err);
        }
      });
      server.listen(port, () => {
        server.close();
        clearTimeout(timeout);
        resolve();
      });
    }

    checkPort();
  });
}
