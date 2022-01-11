import type { MessageEvent } from "ws";
import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage, Server, ServerResponse } from "http";
import { createServer } from "http";
import { useEffect, useRef, useState } from "react";
import { version } from "../package.json";

import type Protocol from "devtools-protocol";

/**
 * `useInspector` is a hook for debugging Workers applications
 *  when using `wrangler dev`.
 *
 * When we start a session with `wrangler dev`, the Workers platform
 * also exposes a debugging websocket that implements the DevTools
 * Protocol. While we could just start up DevTools and connect to this
 * URL, that URL changes every time we make a change to the
 * worker, or when the session expires. Instead, we start up a proxy
 * server locally that acts as a bridge between the remote DevTools
 * server and the local DevTools instance. So whenever the URL changes,
 * we can can silently connect to it and keep the local DevTools instance
 * up to date. Further, we also intercept these messages and selectively
 * log them directly to the terminal (namely, calls to `console.<x>`,
 * and exceptions)
 */

/**
 * TODO:
 * - clear devtools whenever we save changes to the worker
 * - clear devtools when we switch between local/remote modes
 * - handle more methods from console
 */

interface InspectorProps {
  /**
   * The port that the local proxy server should listen on.
   */
  port: number;
  /**
   * The websocket URL exposed by Workers that the inspector should connect to.
   */
  inspectorUrl: undefined | string;
  /**
   * Whether console statements and exceptions should be logged to the terminal.
   * (We don't log them in local mode because they're already getting
   * logged to the terminal by nature of them actually running in node locally.)
   */
  logToTerminal: boolean;
}

export default function useInspector(props: InspectorProps) {
  /** A unique ID for this session. */
  const inspectorIdRef = useRef(randomId());
  /**
   *  The local proxy server that acts as the bridge between
   *  the remote websocket and the local DevTools instance.
   */
  const serverRef = useRef<Server>();
  /** The websocket server that runs on top of the proxy server. */
  const wsServerRef = useRef<WebSocketServer>();

  /** The websocket from the devtools instance. */
  const [localWebSocket, setLocalWebSocket] = useState<WebSocket>();
  /**  The websocket from the edge */
  const [remoteWebSocket, setRemoteWebSocket] = useState<
    WebSocket | undefined
  >();

  if (!serverRef.current) {
    // Let's create the proxy server!
    serverRef.current = createServer(
      (req: IncomingMessage, res: ServerResponse) => {
        switch (req.url) {
          // We implement a couple of well known end points
          // that are queried for metadata by chrome://inspect
          case "/json/version":
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                Browser: `wrangler/v${version}`,
                // TODO: (someday): The DevTools protocol should match that of Edge Worker.
                // This could be exposed by the preview API.
                "Protocol-Version": "1.3",
              })
            );
            return;
          case "/json":
          case "/json/list":
            {
              res.setHeader("Content-Type", "application/json");
              const localHost = `localhost:${props.port}/ws`;
              const devtoolsFrontendUrl = `devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=${localHost}`;
              const devtoolsFrontendUrlCompat = `devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${localHost}`;
              res.end(
                JSON.stringify([
                  {
                    id: inspectorIdRef.current,
                    type: "node",
                    description: "workers",
                    webSocketDebuggerUrl: `ws://${localHost}`,
                    devtoolsFrontendUrl,
                    devtoolsFrontendUrlCompat,
                    // Below are fields that are visible in the DevTools UI.
                    title: "Cloudflare Worker",
                    faviconUrl: "https://workers.cloudflare.com/favicon.ico",
                    url:
                      "https://" +
                      (remoteWebSocket
                        ? new URL(remoteWebSocket.url).host
                        : "workers.dev"),
                  },
                ])
              );
            }
            return;
          default:
            break;
        }
      }
    );

    // Let's create the websocket server on top of the proxy server
    wsServerRef.current = new WebSocketServer({
      server: serverRef.current,
      clientTracking: true,
    });
    wsServerRef.current.on("connection", function (ws: WebSocket) {
      if (this.clients.size > 1) {
        /** We only want to have one active Devtools instance at a time. */
        console.error(
          "Tried to open a new devtools window when a previous one was already open."
        );
        ws.close(1013, "Too many clients; only one can be connected at a time");
      } else {
        // As promised, save the created websocket in a state hook
        setLocalWebSocket(ws);

        ws.addEventListener("close", () => {
          // And and cleanup when devtools closes
          setLocalWebSocket(undefined);
        });
      }
    });
  }

  /**
   * We start and stop the server in an effect to take advantage
   * of the component lifecycle. Convenient.
   */
  useEffect(() => {
    if (serverRef.current) {
      serverRef.current.listen(props.port);
      return () => {
        if (serverRef.current) {
          serverRef.current.close();
        }
        // Also disconnect any open websockets/devtools connections
        if (wsServerRef.current) {
          wsServerRef.current.clients.forEach((ws) => ws.close());
          wsServerRef.current.close();
        }
      };
    }
  }, [props.port]);

  /**
   * When connecting to the remote websocket, if we don't start either
   * the devtools instance or make an actual request to the worker in time,
   * then the connecting process can error out. When this happens, we
   * want to simply retry the connection. We use a state hook to trigger retries
   * of the effect that connects to the remote websocket.
   */
  const [
    retryRemoteWebSocketConnectionSigil,
    setRetryRemoteWebSocketConnectionSigil,
  ] = useState<number>(0);
  function retryRemoteWebSocketConnection() {
    setRetryRemoteWebSocketConnectionSigil((x) => x + 1);
  }

  /** A simple incrementing id to attach to messages we send to devtools */
  const messageCounterRef = useRef(1);

  // This effect tracks the connection to the remote websocket
  // (stored in, no surprises here, `remoteWebSocket`)
  useEffect(() => {
    if (!props.inspectorUrl) {
      return;
    }
    // The actual websocket instance
    const ws = new WebSocket(props.inspectorUrl);
    setRemoteWebSocket(ws);

    /**
     * A handle to the interval we run to keep the websocket alive
     */
    let keepAliveInterval: NodeJS.Timer;

    /**
     * Test if the websocket is closed
     */
    function isClosed() {
      return (
        ws.readyState === WebSocket.CLOSED ||
        ws.readyState === WebSocket.CLOSING
      );
    }

    /**
     * Send a message to the remote websocket
     */
    function send(event: Record<string, unknown>): void {
      if (!isClosed()) {
        ws.send(JSON.stringify(event));
      }
    }

    /**
     * Closes the inspector.
     */
    function close(): void {
      if (!isClosed()) {
        try {
          ws.close();
        } catch (err) {
          // Closing before the websocket is ready will throw an error.
        }
      }
    }

    /**
     * Since we have a handle on the remote websocket, we can tap
     * into its events, and log any pertinent ones directly to
     * the terminal (which means you have insight into your worker
     * without having to open the devtools).
     */
    if (props.logToTerminal) {
      ws.addEventListener("message", (event: MessageEvent) => {
        if (typeof event.data === "string") {
          const evt = JSON.parse(event.data);
          if (evt.method === "Runtime.exceptionThrown") {
            const params = evt.params as Protocol.Runtime.ExceptionThrownEvent;
            console.error(
              "🚨", // cheesy, but it works
              // maybe we could use color here too.
              params.exceptionDetails.text,
              params.exceptionDetails.exception?.description ?? ""
            );
          }
          if (evt.method === "Runtime.consoleAPICalled") {
            logConsoleMessage(
              evt.params as Protocol.Runtime.ConsoleAPICalledEvent
            );
          }
        } else {
          // We should never get here, but who know is 2022...
          console.error("unrecognised devtools event:", event);
        }
      });
    }

    ws.addEventListener("open", () => {
      send({ method: "Runtime.enable", id: messageCounterRef.current });
      // TODO: This doesn't actually work. Must fix.
      send({ method: "Network.enable", id: messageCounterRef.current++ });

      keepAliveInterval = setInterval(() => {
        send({
          method: "Runtime.getIsolateId",
          id: messageCounterRef.current++,
        });
      }, 10_000);
    });

    ws.on("unexpected-response", () => {
      console.log("waiting for connection...");
      /**
       * This usually means the worker is not "ready" yet
       * so we'll just retry the connection process
       */
      retryRemoteWebSocketConnection();
    });

    ws.addEventListener("close", () => {
      clearInterval(keepAliveInterval);
    });

    return () => {
      // clean up! Let's first stop the heartbeat interval
      clearInterval(keepAliveInterval);
      // Then we'll send a message to the devtools instance to
      // tell it to clear the console.
      wsServerRef.current?.clients.forEach((client) => {
        // We could've used `localSocket` here, but
        // then we would have had to add it to the effect
        // change detection array, which would have made a
        // bunch of other stuff complicated. So we'll just
        // cycle through all of the server's connected clients
        // (in practice, there should only be one or zero) and send
        // the Log.clear message.
        client.send(
          JSON.stringify({
            // TODO: This doesn't actually work. Must fix.
            method: "Log.clear",
            // we can disable the next eslint warning since
            // we're referencing a ref that stays alive
            // eslint-disable-next-line react-hooks/exhaustive-deps
            id: messageCounterRef.current++,
            params: {},
          })
        );
      });
      // Finally, we'll close the websocket
      close();
      // And we'll clear `remoteWebsocket`
      setRemoteWebSocket(undefined);
    };
  }, [
    props.inspectorUrl,
    retryRemoteWebSocketConnectionSigil,
    props.logToTerminal,
  ]);

  /**
   * We want to make sure we don't lose any messages we receive from the
   * remote websocket before devtools connects. So we use a ref to buffer
   * messages, and flush them whenever devtools connects.
   */
  const messageBufferRef = useRef<MessageEvent[]>([]);

  // This effect tracks the state changes _between_ the local
  // and remote websockets, and handles how messages flow between them.
  useEffect(() => {
    /**
     * This event listener is used for buffering messages from
     * the remote websocket, and flushing them
     * when the local websocket connects.
     */
    function bufferMessageFromRemoteSocket(event: MessageEvent) {
      messageBufferRef.current.push(event);
      // TODO: maybe we should have a max limit on this?
      // if so, we should be careful when removing messages
      // from the front, because they could be critical for
      // devtools (like execution context creation, etc)
    }

    if (remoteWebSocket && !localWebSocket) {
      // The local websocket hasn't connected yet, so we'll
      // buffer messages until it does.
      remoteWebSocket.addEventListener(
        "message",
        bufferMessageFromRemoteSocket
      );
    }

    /** Send a message from the local websocket to the remote websocket */
    function sendMessageToRemoteWebSocket(event: MessageEvent) {
      try {
        remoteWebSocket?.send(event.data);
      } catch (e) {
        if (e.message !== "WebSocket is not open: readyState 0 (CONNECTING)") {
          /**
           * ^ this just means we haven't opened a websocket yet
           * usually happens until there's at least one request
           * which is weird, because we may miss something that
           * happens on the first request. Maybe we should buffer
           * these messages too?
           */
          console.error(e);
        }
      }
    }

    /** Send a message from the local websocket to the remote websocket */
    function sendMessageToLocalWebSocket(event: MessageEvent) {
      localWebSocket?.send(event.data);
    }

    if (localWebSocket && remoteWebSocket) {
      // Both the remote and local websockets are connected, so let's
      // start sending messages between them.
      localWebSocket.addEventListener("message", sendMessageToRemoteWebSocket);
      remoteWebSocket.addEventListener("message", sendMessageToLocalWebSocket);

      // Also, let's flush any buffered messages
      messageBufferRef.current.forEach(sendMessageToLocalWebSocket);
      messageBufferRef.current = [];
    }

    return () => {
      // Cleanup like good citizens
      if (remoteWebSocket) {
        remoteWebSocket.removeEventListener(
          "message",
          bufferMessageFromRemoteSocket
        );
        remoteWebSocket.removeEventListener(
          "message",
          sendMessageToLocalWebSocket
        );
      }
      if (localWebSocket) {
        localWebSocket.removeEventListener(
          "message",
          sendMessageToRemoteWebSocket
        );
      }
    };
  }, [localWebSocket, remoteWebSocket]);
}

// Credit: https://stackoverflow.com/a/2117523
function randomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * This function converts a message serialised as a devtools event
 * into arguments suitable to be called by a console method, and
 * then actually calls the method with those arguments. Effectively,
 * we're just doing a little bit of the work of the devtools console,
 * directly in the terminal.
 */
function logConsoleMessage(evt: Protocol.Runtime.ConsoleAPICalledEvent): void {
  const args: string[] = [];
  for (const ro of evt.args) {
    switch (ro.type) {
      case "string":
      case "number":
      case "boolean":
      case "undefined":
      case "symbol":
      case "bigint":
        args.push(ro.value);
        break;
      case "function":
        args.push(`[Function: ${ro.description ?? "<no-description>"}]`);
        break;
      case "object":
        if (!ro.preview) {
          args.push(ro.description ?? "<no-description>");
        } else {
          args.push(ro.preview.description ?? "<no-description>");

          switch (ro.preview.subtype) {
            case "array":
              args.push(
                "[ " +
                  ro.preview.properties
                    .map(({ value }) => {
                      return value;
                    })
                    .join(", ") +
                  (ro.preview.overflow ? "..." : "") +
                  " ]"
              );

              break;
            case "map":
              args.push(
                "{\n" +
                  ro.preview.entries
                    ?.map(({ key, value }) => {
                      return `  ${key?.description ?? "<unknown>"} => ${
                        value.description
                      }`;
                    })
                    .join(",\n") +
                  (ro.preview.overflow ? "\n  ..." : "") +
                  "\n}"
              );

              break;
            case "set":
              args.push(
                "{ " +
                  ro.preview.entries
                    ?.map(({ value }) => {
                      return `${value.description}`;
                    })
                    .join(", ") +
                  (ro.preview.overflow ? ", ..." : "") +
                  " }"
              );

              break;
            case "null":
              args.push("null");
              break;
            case "node":
            case "regexp":
            case "date":
            case "weakmap":
            case "weakset":
            case "iterator":
            case "generator":
            case "error":
            case "proxy":
            case "promise":
            case "typedarray":
            case "arraybuffer":
            case "dataview":
            case "webassemblymemory":
            case "wasmvalue":
              break;
            default:
              // just a pojo
              args.push(
                "{\n" +
                  ro.preview.properties
                    .map(({ name, value }) => {
                      return `  ${name}: ${value}`;
                    })
                    .join(",\n") +
                  (ro.preview.overflow ? "\n  ..." : "") +
                  "\n}"
              );
          }
        }
        break;
      default:
        args.push(ro.description || ro.unserializableValue || "🦋");
        break;
    }
  }

  console[evt.type](...args);
}
