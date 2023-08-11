import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import assert from "node:assert";
import { createServer } from "node:http";
import os from "node:os";
import { URL } from "node:url";
import path from "path";
import open from "open";
import { useEffect, useRef, useState } from "react";
import { SourceMapConsumer } from "source-map";
import WebSocket, { WebSocketServer } from "ws";
import { version } from "../package.json";
import { logger } from "./logger";
import { waitForPortToBeAvailable } from "./proxy";
import { getAccessToken } from "./user/access";
import type Protocol from "devtools-protocol";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
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

/**
 * TODO:
 * - clear devtools whenever we save changes to the worker
 * - clear devtools when we switch between local/remote modes
 * - handle more methods from console
 */

// Information about Wrangler's bundling process that needs passsed through
// for DevTools sourcemap transformation
export interface SourceMapMetadata {
	tmpDir: string;
	entryDirectory: string;
}

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

export default function useInspector(props: InspectorProps) {
	/** A unique ID for this session. */
	const inspectorIdRef = useRef(randomId());

	/** The websocket from the devtools instance. */
	const [localWebSocket, setLocalWebSocket] = useState<WebSocket>();
	/**  The websocket from the edge */
	const [remoteWebSocket, setRemoteWebSocket] = useState<WebSocket>();

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

	wsServer.on("connection", (ws: WebSocket) => {
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
			// As promised, save the created websocket in a state hook
			setLocalWebSocket(ws);

			ws.addEventListener("close", () => {
				// And and cleanup when devtools closes
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

	// Initialize the source map consumer
	const sourceMapConsumerRef = useRef<SourceMapConsumer>();

	useEffect(() => {
		if (!props.sourceMapPath) {
			return;
		}

		const sourceMapPath = props.sourceMapPath;
		let cleanedUp = false;
		// Parse in the sourcemap
		(async () => {
			const mapContent = JSON.parse(await readFile(sourceMapPath, "utf-8"));

			sourceMapConsumerRef.current = await new SourceMapConsumer(mapContent);

			if (cleanedUp) {
				sourceMapConsumerRef.current.destroy();
				sourceMapConsumerRef.current = undefined;
			}
		})().catch((e) => logger.warn("Failed to parse source map.", e));

		return () => {
			cleanedUp = true;
			if (sourceMapConsumerRef.current) {
				sourceMapConsumerRef.current.destroy();
				sourceMapConsumerRef.current = undefined;
			}
		};
	}, [props.sourceMapPath]);

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

						// Parse stack trace with source map.
						if (sourceMapConsumerRef.current) {
							// Log the parsed stacktrace
							logger.error(
								params.exceptionDetails.text,
								translateErrorStackTrace(
									sourceMapConsumerRef.current,
									params.exceptionDetails.exception?.description,
									params.exceptionDetails.stackTrace?.callFrames
								)
							);
						} else {
							// We log the stacktrace to the terminal
							logger.error(
								params.exceptionDetails.text,
								params.exceptionDetails.exception?.description ?? ""
							);
						}
					}
					if (evt.method === "Runtime.consoleAPICalled") {
						// Parse stack trace with source map.
						if (sourceMapConsumerRef.current) {
							translateLogStackTraces(
								sourceMapConsumerRef.current,
								evt.params.args
							);
						}

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
				if (
					message.method === "Network.loadNetworkResource" &&
					props.sourceMapPath !== undefined &&
					props.sourceMapMetadata !== undefined
				) {
					const url = new URL(message.params.url);
					if (url.protocol === "worker:") {
						if (message.params.url.endsWith(".map")) {
							// Read the generated source map from esbuild
							const sourceMap = JSON.parse(
								readFileSync(props.sourceMapPath, "utf-8")
							);

							// The source root is a temporary directory (`tmpDir`), and so shouldn't be user-visible
							// It provides no useful info to the user
							sourceMap.sourceRoot = "";

							const tmpDir = props.sourceMapMetadata.tmpDir;

							// See https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit#heading=h.mt2g20loc2ct
							// The above link documents the x_google_ignoreList property, which is intended to mark code that shouldn't be visible in DevTools
							// Here we use it to indicate specifically Wrangler-injected code (facades & middleware)
							sourceMap.x_google_ignoreList = sourceMap.sources
								// Filter anything in the generated tmpDir, and anything from Wrangler's templates
								// This should cover facades and middleware, but intentionally doesn't include all non-user code e.g. node_modules
								.map((s: string, idx: number) =>
									s.includes(tmpDir) || s.includes("wrangler/templates")
										? idx
										: null
								)
								.filter((i: number | null) => i !== null);

							const entryDirectory = props.sourceMapMetadata.entryDirectory;

							sourceMap.sources = sourceMap.sources.map(
								(s: string) =>
									// These are never loaded by Wrangler or DevTools. However, the presence of a scheme is required for DevTools to show the path as folders in the Sources view
									// The scheme is intentially not the same as for the sourceMappingURL
									// Without this difference in scheme, DevTools will not strip prefix `../` path elements from top level folders (../node_modules -> node_modules, for instance)
									`worker://${props.name}/${path.relative(entryDirectory, s)}`
							);

							sendMessageToLocalWebSocket({
								data: JSON.stringify({
									id: message.id,
									result: {
										resource: {
											success: true,
											text: JSON.stringify(sourceMap),
										},
									},
								}),
							});
						} else {
							let text: string | undefined;
							try {
								text = readFileSync(url.pathname, "utf-8");
							} catch {}
							sendMessageToLocalWebSocket({
								data: JSON.stringify({
									id: message.id,
									result: {
										resource: {
											success: !!text,
											text: text,
										},
									},
								}),
							});
						}
					}
					return;
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
				const message = JSON.parse(event.data as string);
				if (message.method === "Debugger.scriptParsed") {
					// Add the worker:// scheme conditionally, since some module types already have schemes (e.g. wasm)
					if (message.params.url === "core:user:main") {
						message.params.url = `worker://${props.name}/${
							message.params.sourceMapURL?.slice(0, -4) ?? "main.js"
						}`;
					} else {
						message.params.url = new URL(
							message.params.url,
							`worker://${props.name}`
						).href;
					}
					localWebSocket.send(JSON.stringify(message));
					return;
				}

				if (
					message.method === "Runtime.consoleAPICalled" &&
					sourceMapConsumerRef.current &&
					translateLogStackTraces(
						sourceMapConsumerRef.current,
						message.params.args,
						(p) => `worker://${props.name}${p}`
					)
				) {
					localWebSocket.send(JSON.stringify(message));
					return;
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

type MinimalCallFrame = Pick<
	Protocol.Runtime.CallFrame,
	"lineNumber" | "columnNumber"
> &
	Partial<Pick<Protocol.Runtime.CallFrame, "functionName" | "url">>;

function isErrorString(s: string): boolean {
	return Boolean(s.match(/Error(?::[^\n]+)?\n\s+at [^\n]+:\d+:\d+/));
}

function parseErrorStackTrace(s: string): MinimalCallFrame[] {
	return s
		.split("\n")
		.slice(1)
		.map((line): MinimalCallFrame | undefined => {
			let m = line.match(/^\s*at ([^\s]+?) \([^\s]+?:(\d+):(\d+)\)/);
			if (m) {
				return {
					functionName: m[1],
					lineNumber: parseInt(m[2]) - 1,
					columnNumber: parseInt(m[3]) - 1,
				};
			}

			m = line.match(/^\s*at [^\s]+?:(\d+):(\d+)$/);
			if (m) {
				return {
					lineNumber: parseInt(m[1]) - 1,
					columnNumber: parseInt(m[2]) - 1,
				};
			}
		})
		.filter((f): f is MinimalCallFrame => Boolean(f));
}

function translateErrorCallFrames<Frame extends MinimalCallFrame>(
	consumer: SourceMapConsumer,
	frames: Array<Frame>,
	formatPath: (sourcePath: string) => string = path.relative.bind(
		null,
		process.cwd()
	)
): Array<Frame & { source?: string | null }> {
	return frames.map((frame) => {
		try {
			if (frame.lineNumber) {
				// The line and column numbers in the stackTrace are zero indexed,
				// whereas the sourcemap consumer indexes from one.
				const pos = consumer.originalPositionFor({
					line: frame.lineNumber + 1,
					column: frame.columnNumber + 1,
				});

				// From the way esbuild implements the "names" field:
				// > To save space, the original name is only recorded when it's different from the final name.
				// however, source-map consumer does not handle this
				if (pos && pos.line != null) {
					return {
						...frame,
						functionName: pos.name || frame.functionName || "",
						lineNumber: pos.line - 1,
						columnNumber: pos.column ? pos.column - 1 : null,
						source: pos.source,
						url: pos.source && formatPath(pos.source),
					};
				}
			}
		} catch {
			// Line failed to parse through the sourcemap consumer
			// We should handle this better
		}

		// return the original frame if we failed to translate it
		return frame;
	});
}

function translateErrorStackTrace(
	consumer: SourceMapConsumer,
	description: string | undefined,
	frames?: Protocol.Runtime.CallFrame[] | undefined,
	formatPath?: (sourcePath: string) => string
): string {
	if (!description) {
		return "";
	}

	// Create the lines for the exception details log
	const exceptionLines = [description?.split("\n")[0]];

	// Pass each of the callframes into the consumer, and format the error
	translateErrorCallFrames(
		consumer,
		frames ?? parseErrorStackTrace(description),
		formatPath
	).forEach(({ functionName, lineNumber, columnNumber, source, url }, i) => {
		if (lineNumber) {
			// Print out line which caused error:
			if (i === 0 && source && lineNumber) {
				const fileSource = consumer.sourceContentFor(source);
				const fileSourceLine = fileSource?.split("\n")[lineNumber] || "";
				if (fileSourceLine) {
					exceptionLines.push(fileSourceLine.trim());

					// If we have a column, we can mark the position underneath
					if (columnNumber) {
						exceptionLines.push(
							`${" ".repeat(columnNumber - fileSourceLine.search(/\S/) + 1)}^`
						);
					}
				}
			}

			let pos = `${url}:${lineNumber + 1}:${columnNumber + 1}`;
			if (functionName) {
				pos = `${functionName} (${pos})`;
			}

			exceptionLines.push(`    at ${pos}`);
		}
	});

	return exceptionLines.join("\n");
}

function translateLogStackTraces(
	consumer: SourceMapConsumer,
	args: Protocol.Runtime.ConsoleAPICalledEvent["args"],
	formatPath?: (sourcePath: string) => string
): boolean {
	let modified = false;
	for (const arg of args) {
		if (arg.type === "string") {
			// test if it's an error stack trace
			if (isErrorString(arg.value)) {
				modified = true;
				arg.value = translateErrorStackTrace(
					consumer,
					arg.value,
					undefined,
					formatPath
				);
			}
		} else if (arg.type === "object" && arg.subtype === "error") {
			modified = true;
			arg.description = translateErrorStackTrace(
				consumer,
				arg.description,
				undefined,
				formatPath
			);

			if (arg.preview?.type === "object" && arg.preview.subtype === "error") {
				arg.preview.description = translateErrorStackTrace(
					consumer,
					arg.preview.description,
					undefined,
					formatPath
				);
			}
		}
	}

	return modified;
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

export const mapConsoleAPIMessageTypeToConsoleMethod: {
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
