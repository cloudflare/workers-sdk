import { readFileSync } from "fs";
import assert from "node:assert";
import crypto from "node:crypto";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import open from "open";
import { useEffect, useRef, useState } from "react";
import WebSocket, { WebSocketServer } from "ws";
import { version } from "../../package.json";
import { logger } from "../logger";
import { getSourceMappedStack } from "../sourcemap";
import { getAccessToken } from "../user/access";
import { waitForPortToBeAvailable } from "./proxy";
import type { SourceMapMetadata } from "../deployment-bundle/bundle";
import type Protocol from "devtools-protocol";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { RawSourceMap } from "source-map";
import type { MessageEvent } from "ws";

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

// TODO:
// - clear devtools whenever we save changes to the worker
// - clear devtools when we switch between local/remote modes
// - handle more methods from console

interface InspectorProps {
	/**
	 * The port that the local proxy server should listen on.
	 */
	port: number;
	/**
	 * The websocket URL exposed by Workers that the inspector should connect to.
	 */
	inspectorUrl: string | undefined;
	/**
	 * Whether console statements and exceptions should be logged to the terminal.
	 * (We don't log them in local mode because they're already getting
	 * logged to the terminal by nature of them actually running in node locally.)
	 */
	logToTerminal: boolean;
	/**
	 * Sourcemap path, so that stacktraces can be interpretted
	 */
	sourceMapPath: string | undefined;

	sourceMapMetadata: SourceMapMetadata | undefined;

	host?: string;

	name?: string;
}

type LocalWebSocket = WebSocket & { isDevTools?: boolean };

export default function useInspector(props: InspectorProps) {
	/** A unique ID for this session. */
	const inspectorIdRef = useRef(crypto.randomUUID());

	/** The websocket from the devtools instance. */
	const [localWebSocket, setLocalWebSocket] = useState<LocalWebSocket>();
	/**  The websocket from the edge */
	const [remoteWebSocket, setRemoteWebSocket] = useState<WebSocket>();

	/**
	 * Source maps included in `Debugger.scriptParsed` events sent by the current
	 * `remoteWebSocket`. Each source map is given a unique ID which must be
	 * included when fetching the source map to prevent arbitrary file access.
	 * We assume each `Debugger.scriptParsed` event will trigger a single fetch
	 * for the corresponding source map, so remove source maps after they've been
	 * fetched once.
	 */
	const sourceMaps = useRef<Map<string /* id */, string /* filePath */>>();
	sourceMaps.current ??= new Map();
	/**
	 * For source maps without `sourcesContent`, DevTools will request the
	 * contents of source files too. Again, we'd like to prevent arbitrary file
	 * access here, so only allow fetching sources if we've seen the path
	 * when responding with a source map. We again assume each source will be
	 * fetched once, so remove allowed sources after fetch.
	 */
	const allowedSourcePaths = useRef<Set<string /* filePath */>>();
	allowedSourcePaths.current ??= new Set();

	/**
	 *  The local proxy server that acts as the bridge between
	 *  the remote websocket and the local DevTools instance.
	 */
	const serverRef = useRef<Server>();
	if (serverRef.current === undefined) {
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
	}
	const server = serverRef.current;

	/**
	 * The websocket server that runs on top of the proxy server.
	 */
	const wsServerRef = useRef<WebSocketServer>();
	if (wsServerRef.current === undefined) {
		wsServerRef.current = new WebSocketServer({
			server,
			clientTracking: true,
		});
	}
	const wsServer = wsServerRef.current;

	wsServer.on("connection", (ws, req) => {
		if (wsServer.clients.size > 1) {
			/** We only want to have one active Devtools instance at a time. */
			logger.error(
				"Tried to open a new devtools window when a previous one was already open."
			);
			ws.close(1013, "Too many clients; only one can be connected at a time");
		} else {
			// Since Wrangler proxies the inspector, reloading Chrome DevTools won't trigger debugger initialisation events (because it's connecting to an extant session).
			// This sends a `Debugger.disable` message to the remote when a new WebSocket connection is initialised,
			// with the assumption that the new connection will shortly send a `Debugger.enable` event and trigger re-initialisation.
			// The key initialisation messages that are needed are the `Debugger.scriptParsed events`.
			remoteWebSocket?.send(
				JSON.stringify({
					// This number is arbitrary, and is chosen to be high so as not to conflict with messages that DevTools might actually send.
					// For completeness, these options don't work: 0, -1, or Number.MAX_SAFE_INTEGER
					id: 100_000_000,
					method: "Debugger.disable",
				})
			);

			// Our patched DevTools are hosted on a `https://` URL. These cannot
			// access `file://` URLs, meaning local source maps cannot be fetched.
			// To get around this, we can rewrite `Debugger.scriptParsed` events to
			// include a special `worker:` scheme for source maps, and respond to
			// `Network.loadNetworkResource` commands for these. Unfortunately, this
			// breaks IDE's built-in debuggers (e.g. VSCode and WebStorm), so we only
			// want to enable this transformation when we detect hosted DevTools has
			// connected. We do this by looking at the WebSocket handshake headers:
			//
			// # DevTools
			//
			// Upgrade: websocket
			// Host: localhost:9229
			// (from Chrome)  User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36
			// (from Firefox) User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/116.0
			// Origin: https://devtools.devprod.cloudflare.dev
			// ...
			//
			// # VSCode
			//
			// Upgrade: websocket
			// Host: localhost
			// ...
			//
			// # WebStorm
			//
			// Upgrade: websocket
			// Host: localhost:9229
			// Origin: http://localhost:9229
			// ...
			//
			// From this, we could just use the presence of a `User-Agent` header to
			// determine if DevTools connected, but VSCode/WebStorm could very well
			// add this in future versions. We could also look for an `Origin` header
			// matching the hosted DevTools URL, but this would prevent preview/local
			// versions working. Instead, we look for a browser-like `User-Agent`.
			const localWs: LocalWebSocket = ws;
			localWs.isDevTools = /mozilla/i.test(req.headers["user-agent"] ?? "");

			// As promised, save the created websocket in a state hook
			setLocalWebSocket(localWs);

			ws.addEventListener("close", () => {
				// And cleanup when devtools closes
				setLocalWebSocket(undefined);
			});
		}
	});

	/**
	 * We start and stop the server in an effect to take advantage
	 * of the component lifecycle. Convenient.
	 */
	useEffect(() => {
		const abortController = new AbortController();
		async function startInspectorProxy() {
			await waitForPortToBeAvailable(props.port, {
				retryPeriod: 200,
				timeout: 2000,
				abortSignal: abortController.signal,
			});
			server.listen(props.port);
		}
		startInspectorProxy().catch((err) => {
			if ((err as { code: string }).code !== "ABORT_ERR") {
				logger.error("Failed to start inspector:", err);
			}
		});
		return () => {
			server.close();
			// Also disconnect any open websockets/devtools connections
			wsServer.clients.forEach((ws) => ws.close());
			wsServer.close();
			abortController.abort();
		};
	}, [props.port, server, wsServer]);

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

	const cfAccessRef = useRef<string>();

	useEffect(() => {
		const run = async () => {
			if (props.host && !cfAccessRef.current) {
				const token = await getAccessToken(props.host);
				cfAccessRef.current = token;
			}
		};
		if (props.host) void run();
	}, [props.host]);

	// This effect tracks the connection to the remote websocket
	// (stored in, no surprises here, `remoteWebSocket`)
	useEffect(() => {
		if (!props.inspectorUrl) {
			return;
		}

		// The actual websocket instance
		const ws = new WebSocket(props.inspectorUrl, {
			headers: {
				cookie: `CF_Authorization=${cfAccessRef.current}`,
			},
		});
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
			ws.addEventListener("message", async (event: MessageEvent) => {
				if (typeof event.data === "string") {
					const evt = JSON.parse(event.data);
					if (evt.method === "Runtime.exceptionThrown") {
						const params = evt.params as Protocol.Runtime.ExceptionThrownEvent;
						const stack = getSourceMappedStack(params.exceptionDetails);
						logger.error(params.exceptionDetails.text, stack);
					}
					if (evt.method === "Runtime.consoleAPICalled") {
						logConsoleMessage(
							evt.params as Protocol.Runtime.ConsoleAPICalledEvent
						);
					}
				} else {
					// We should never get here, but who know is 2022...
					logger.error("Unrecognised devtools event:", event);
				}
			});
		}

		ws.addEventListener("open", () => {
			send({
				method: "Runtime.discardConsoleEntries",
				id: messageCounterRef.current++,
			});
			send({ method: "Runtime.enable", id: messageCounterRef.current++ });
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
			logger.log("Waiting for connection...");
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
			wsServer.clients.forEach((client) => {
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
		props.logToTerminal,
		props.sourceMapPath,
		wsServer,
		// We use a state value as a sigil to trigger a retry of the
		// remote websocket connection. It's not used inside the effect,
		// so react-hooks/exhaustive-deps doesn't complain if it's not
		// included in the dependency array. But its presence is critical,
		// so do NOT remove it from the dependency list.
		retryRemoteWebSocketConnectionSigil,
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
				// Intercept Network.loadNetworkResource to load sourcemaps
				const message = JSON.parse(event.data as string);
				if (message.method === "Network.loadNetworkResource") {
					// `sourceMaps.current` and `allowSourcePaths.current` are always
					// defined after `useRef()`
					assert(sourceMaps.current !== undefined);
					assert(allowedSourcePaths.current !== undefined);
					const maybeText = maybeHandleNetworkLoadResource(
						message.params.url,
						sourceMaps.current,
						allowedSourcePaths.current,
						props.sourceMapMetadata?.tmpDir
					);
					if (maybeText !== undefined) {
						sendMessageToLocalWebSocket({
							data: JSON.stringify({
								id: message.id,
								result: { resource: { success: true, text: maybeText } },
							}),
						});
						return;
					}
				}
			} catch (e) {
				logger.debug(e);
				// Ignore errors, fallthrough to the remote inspector
			}
			try {
				assert(
					remoteWebSocket,
					"Trying to send a message to an undefined `remoteWebSocket`"
				);
				remoteWebSocket.send(event.data);
			} catch (e) {
				if (
					(e as Error).message !==
					"WebSocket is not open: readyState 0 (CONNECTING)"
				) {
					/**
					 * ^ this just means we haven't opened a websocket yet
					 * usually happens until there's at least one request
					 * which is weird, because we may miss something that
					 * happens on the first request. Maybe we should buffer
					 * these messages too?
					 */
					logger.error(e);
				}
			}
		}

		/** Send a message from the local websocket to the remote websocket */
		function sendMessageToLocalWebSocket(event: Pick<MessageEvent, "data">) {
			assert(
				localWebSocket,
				"Trying to send a message to an undefined `localWebSocket`"
			);
			try {
				// Intercept Debugger.scriptParsed responses to inject URL schemes
				if (localWebSocket.isDevTools) {
					const message = JSON.parse(event.data as string);
					if (message.method === "Debugger.scriptParsed") {
						if (message.params.sourceMapURL) {
							const url = new URL(
								message.params.sourceMapURL,
								message.params.url
							);
							if (url.protocol === "file:") {
								// `sourceMaps.current` is always defined after `useRef()`
								assert(sourceMaps.current !== undefined);
								const name = props.name ?? "worker";
								const id = crypto.randomUUID();
								sourceMaps.current.set(id, fileURLToPath(url));
								// The hostname of this URL will show up next to the cloud icon
								// under authored sources, so use the worker name.
								message.params.sourceMapURL = `worker://${name}/${id}`;
								localWebSocket.send(JSON.stringify(message));
								return;
							}
						}
					}
				}
			} catch (e) {
				logger.debug(e);
				// Ignore errors, fallthrough to the local websocket
			}

			localWebSocket.send(event.data);
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
	}, [
		localWebSocket,
		remoteWebSocket,
		props.name,
		props.sourceMapMetadata,
		props.sourceMapPath,
	]);
}

/**
 * This function converts a message serialized as a devtools event
 * into arguments suitable to be called by a console method, and
 * then actually calls the method with those arguments. Effectively,
 * we're just doing a little bit of the work of the devtools console,
 * directly in the terminal.
 */
const mapConsoleAPIMessageTypeToConsoleMethod: {
	[key in Protocol.Runtime.ConsoleAPICalledEvent["type"]]: Exclude<
		keyof Console,
		"Console"
	>;
} = {
	log: "log",
	debug: "debug",
	info: "info",
	warning: "warn",
	error: "error",
	dir: "dir",
	dirxml: "dirxml",
	table: "table",
	trace: "trace",
	clear: "clear",
	count: "count",
	assert: "assert",
	profile: "profile",
	profileEnd: "profileEnd",
	timeEnd: "timeEnd",
	startGroup: "group",
	startGroupCollapsed: "groupCollapsed",
	endGroup: "groupEnd",
};

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
					args.push(
						ro.subtype === "null"
							? "null"
							: ro.description ?? "<no-description>"
					);
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
						case "weakmap":
						case "map":
							ro.preview.entries === undefined
								? args.push("{}")
								: args.push(
										"{\n" +
											ro.preview.entries
												.map(({ key, value }) => {
													return `  ${key?.description ?? "<unknown>"} => ${
														value.description
													}`;
												})
												.join(",\n") +
											(ro.preview.overflow ? "\n  ..." : "") +
											"\n}"
								  );

							break;
						case "weakset":
						case "set":
							ro.preview.entries === undefined
								? args.push("{}")
								: args.push(
										"{ " +
											ro.preview.entries
												.map(({ value }) => {
													return `${value.description}`;
												})
												.join(", ") +
											(ro.preview.overflow ? ", ..." : "") +
											" }"
								  );
							break;
						case "regexp":
							break;
						case "date":
							break;
						case "generator":
							args.push(ro.preview.properties[0].value || "");
							break;
						case "promise":
							if (ro.preview.properties[0].value === "pending") {
								args.push(`{<${ro.preview.properties[0].value}>}`);
							} else {
								args.push(
									`{<${ro.preview.properties[0].value}>: ${ro.preview.properties[1].value}}`
								);
							}
							break;
						case "node":
						case "iterator":
						case "proxy":
						case "typedarray":
						case "arraybuffer":
						case "dataview":
						case "webassemblymemory":
						case "wasmvalue":
							break;
						case "error":
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

	const method = mapConsoleAPIMessageTypeToConsoleMethod[evt.type];

	if (method in console) {
		switch (method) {
			case "dir":
				console.dir(args);
				break;
			case "table":
				console.table(args);
				break;
			default:
				// eslint-disable-next-line prefer-spread
				console[method].apply(console, args);
				break;
		}
	} else {
		logger.warn(`Unsupported console method: ${method}`);
		logger.warn("console event:", evt);
	}
}

function maybeHandleNetworkLoadResource(
	url: string | URL,
	sourceMaps: Map<string /* id */, string /* filePath */>,
	allowedSourcePaths: Set<string /* filePath */>,
	tmpDir?: string
): string | undefined {
	if (typeof url === "string") url = new URL(url);
	if (url.protocol !== "worker:") return;

	// Check whether we have a source map matching this ID...
	const id = url.pathname.substring(1);
	const maybeSourceMapFilePath = sourceMaps.get(id);
	if (maybeSourceMapFilePath !== undefined) {
		// Assume DevTools fetches each source map once (after receipt of the
		// `Debugger.scriptParsed` event), and remove it from the map to prevent
		// unbounded growth.
		sourceMaps.delete(id);

		// Read and parse the source map
		const sourceMap: RawSourceMap & {
			x_google_ignoreList?: number[];
		} = JSON.parse(readFileSync(maybeSourceMapFilePath, "utf-8"));

		// See https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit#heading=h.mt2g20loc2ct
		// The above link documents the `x_google_ignoreList property`, which is
		// intended to mark code that shouldn't be visible in DevTools. We use it to
		// indicate specifically Wrangler-injected code (facades & middleware).
		sourceMap.x_google_ignoreList = sourceMap.sources
			// Filter anything in the generated `tmpDir`, and anything from Wrangler's
			// templates. This should cover facades and middleware, but intentionally
			// doesn't include all non-user code e.g. `node_modules`.
			.map((source, i) => {
				if (source.includes("wrangler/templates")) return i;
				if (
					tmpDir !== undefined &&
					path.resolve(sourceMap?.sourceRoot ?? "", source).includes(tmpDir)
				)
					return i;
			})
			.filter((i): i is number => i !== undefined);

		// If this source map doesn't have inline sources, DevTools will attempt to
		// make requests for them, so add all sources paths in this map to the
		// allowed set.
		if (!sourceMap.sourcesContent) {
			const fileURL = pathToFileURL(maybeSourceMapFilePath);
			for (const source of sourceMap.sources) {
				const sourcePath = fileURLToPath(new URL(source, fileURL));
				allowedSourcePaths.add(sourcePath);
			}
		}

		return JSON.stringify(sourceMap);
	}

	// Otherwise, assume this is a request for a source file. Resolve the ID
	// relative to the current working directory, and check if this is allowed.
	const filePath = path.resolve(id);
	if (allowedSourcePaths.has(filePath)) {
		// Assume DevTools fetches each source once (after receipt of the
		// `Network.loadNetworkResource` command response for the source map), and
		// remove it from the set to prevent unbounded growth.
		allowedSourcePaths.delete(filePath);
		return readFileSync(filePath, "utf-8");
	}
}

/**
 * Opens the chrome debugger
 */
export const openInspector = async (
	inspectorPort: number,
	worker: string | undefined
) => {
	const query = new URLSearchParams();
	query.set("theme", "systemPreferred");
	query.set("ws", `localhost:${inspectorPort}/ws`);
	if (worker) query.set("domain", worker);
	query.set("debugger", "true");
	const url = `https://devtools.devprod.cloudflare.dev/js_app?${query.toString()}`;
	const errorMessage =
		"Failed to open inspector.\nInspector depends on having a Chromium-based browser installed, maybe you need to install one?";

	// see: https://github.com/sindresorhus/open/issues/177#issue-610016699
	let braveBrowser: string;
	switch (os.platform()) {
		case "darwin":
		case "win32":
			braveBrowser = "Brave";
			break;
		default:
			braveBrowser = "brave";
	}

	const childProcess = await open(url, {
		app: [
			{
				name: open.apps.chrome,
			},
			{
				name: braveBrowser,
			},
			{
				name: open.apps.edge,
			},
			{
				name: open.apps.firefox,
			},
		],
	});
	childProcess.on("error", () => {
		logger.warn(errorMessage);
	});
};
