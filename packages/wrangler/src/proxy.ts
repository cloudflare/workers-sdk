import { createServer as createHttpServer } from "node:http";
import { connect } from "node:http2";
import { createServer as createHttpsServer } from "node:https";
import WebSocket from "faye-websocket";
import { useEffect, useRef, useState } from "react";
import serveStatic from "serve-static";
import { getHttpsOptions } from "./https-options";
import { logger } from "./logger";
import type { CfPreviewToken } from "./create-worker-preview";
import type {
  IncomingHttpHeaders,
  RequestListener,
  IncomingMessage,
  ServerResponse,
  Server as HttpServer,
} from "node:http";
import type { ClientHttp2Session, ServerHttp2Stream } from "node:http2";
import type { Server as HttpsServer } from "node:https";
import type ws from "ws";

interface IWebsocket extends ws {
  // Pipe implements .on("message", ...)
  pipe<T>(fn: T): IWebsocket;
}

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
  localPort: number,
  localProtocol: "https" | "http"
) {
  for (const [name, value] of Object.entries(headers)) {
    // Rewrite the remote host to the local host.
    if (typeof value === "string" && value.includes(remoteHost)) {
      headers[name] = value
        .replaceAll(
          `https://${remoteHost}`,
          `${localProtocol}://localhost:${localPort}`
        )
        .replaceAll(remoteHost, `localhost:${localPort}`);
    }
  }
}

export function usePreviewServer({
  previewToken,
  publicRoot,
  localProtocol,
  localPort: port,
  ip,
}: {
  previewToken: CfPreviewToken | undefined;
  publicRoot: string | undefined;
  localProtocol: "https" | "http";
  localPort: number;
  ip: string;
}) {
  /** Creates an HTTP/1 proxy that sends requests over HTTP/2. */
  const [proxyServer, setProxyServer] = useState<HttpServer | HttpsServer>();

  /**
   * Create the instance of the local proxy server that will pass on
   * requests to the preview worker.
   */
  useEffect(() => {
    if (proxyServer === undefined) {
      createProxyServer(localProtocol)
        .then((proxy) => setProxyServer(proxy))
        .catch(async (err) => {
          logger.error("Failed to create proxy server:", err);
        });
    }
  }, [proxyServer, localProtocol]);

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
   * The session doesn't last forever, and will eventually drop
   * (usually within 5-15 minutes). When that happens, we simply
   * restart the effect, effectively restarting the server. We use
   * a state sigil as an effect dependency to do so.
   */
  const [retryServerSetupSigil, setRetryServerSetupSigil] = useState<number>(0);
  function retryServerSetup() {
    setRetryServerSetupSigil((x) => x + 1);
  }

  useEffect(() => {
    if (proxyServer === undefined) {
      return;
    }

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
      proxyServer.on("stream", bufferStream);
      cleanupListeners.push(() => proxyServer.off("stream", bufferStream));

      const bufferRequestResponse = (
        request: IncomingMessage,
        response: ServerResponse
      ) => {
        // store the request and response in a buffer so we can replay it later
        requestResponseBufferRef.current.push({ request, response });
      };

      proxyServer.on("request", bufferRequestResponse);
      cleanupListeners.push(() =>
        proxyServer.off("request", bufferRequestResponse)
      );
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
    const handleStream = createStreamHandler(
      previewToken,
      remote,
      port,
      localProtocol
    );
    proxyServer.on("stream", handleStream);
    cleanupListeners.push(() => proxyServer.off("stream", handleStream));

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

        // log all requests to terminal
        logger.log(new Date().toLocaleTimeString(), method, url, status);

        rewriteRemoteHostToLocalHostInHeaders(
          responseHeaders,
          previewToken.host,
          port,
          localProtocol
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

    proxyServer.on("request", actualHandleRequest);
    cleanupListeners.push(() =>
      proxyServer.off("request", actualHandleRequest)
    );

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
      const localWebsocket = new WebSocket(message, socket, body) as IWebsocket;
      // TODO(soon): Custom WebSocket protocol is not working?
      const remoteWebsocketClient = new WebSocket.Client(
        `wss://${previewToken.host}${url}`,
        [],
        { headers }
      ) as IWebsocket;
      localWebsocket.pipe(remoteWebsocketClient).pipe(localWebsocket);
      // We close down websockets whenever we refresh the token.
      cleanupListeners.push(() => {
        localWebsocket.close();
        remoteWebsocketClient.close();
      });
    };
    proxyServer.on("upgrade", handleUpgrade);
    cleanupListeners.push(() => proxyServer.off("upgrade", handleUpgrade));

    return () => {
      cleanupListeners.forEach((cleanup) => cleanup());
    };
  }, [
    previewToken,
    publicRoot,
    port,
    localProtocol,
    proxyServer,
    // We use a state value as a sigil to trigger reconnecting the server.
    // It's not used inside the effect, so react-hooks/exhaustive-deps
    // doesn't complain if it's not included in the dependency array.
    // But its presence is critical, so Do NOT remove it from the dependency list.
    retryServerSetupSigil,
  ]);

  // Start/stop the server whenever the
  // containing component is mounted/unmounted.
  useEffect(() => {
    const abortController = new AbortController();
    if (proxyServer === undefined) {
      return;
    }

    waitForPortToBeAvailable(port, {
      retryPeriod: 200,
      timeout: 2000,
      abortSignal: abortController.signal,
    })
      .then(() => {
        proxyServer.listen(port, ip);
        logger.log(`⬣ Listening at ${localProtocol}://${ip}:${port}`);
      })
      .catch((err) => {
        if ((err as { code: string }).code !== "ABORT_ERR") {
          logger.error(`Failed to start server: ${err}`);
        }
      });

    return () => {
      proxyServer.close();
      abortController.abort();
    };
  }, [port, ip, proxyServer, localProtocol]);
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

async function createProxyServer(
  localProtocol: "https" | "http"
): Promise<HttpServer | HttpsServer> {
  const server: HttpServer | HttpsServer =
    localProtocol === "https"
      ? createHttpsServer(await getHttpsOptions())
      : createHttpServer();

  return server
    .on("upgrade", (req) => {
      // log all websocket connections
      logger.log(
        new Date().toLocaleTimeString(),
        req.method,
        req.url,
        101,
        "(WebSocket)"
      );
    })
    .on("error", (err) => {
      // log all connection errors
      logger.error(new Date().toLocaleTimeString(), err);
    });
}

function createStreamHandler(
  previewToken: CfPreviewToken,
  remote: ClientHttp2Session,
  localPort: number,
  localProtocol: "https" | "http"
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
        localPort,
        localProtocol
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
  options: { retryPeriod: number; timeout: number; abortSignal: AbortSignal }
): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (options.abortSignal as any).addEventListener("abort", () => {
      const abortError = new Error("waitForPortToBeAvailable() aborted");
      (abortError as Error & { code: string }).code = "ABORT_ERR";
      doReject(abortError);
    });

    const timeout = setTimeout(() => {
      doReject(new Error(`Timed out waiting for port ${port}`));
    }, options.timeout);

    const interval = setInterval(checkPort, options.retryPeriod);
    checkPort();

    function doResolve() {
      clearTimeout(timeout);
      clearInterval(interval);
      resolve();
    }

    function doReject(err: unknown) {
      clearInterval(interval);
      clearTimeout(timeout);
      reject(err);
    }

    function checkPort() {
      // Testing whether a port is 'available' involves simply
      // trying to make a server listen on that port, and retrying
      // until it succeeds.
      const server = createHttpServer();
      server.on("error", (err) => {
        // @ts-expect-error non standard property on Error
        if (err.code !== "EADDRINUSE") {
          doReject(err);
        }
      });
      server.listen(port, () => {
        server.close();
        doResolve();
      });
    }
  });
}
