import { createServer as createHttpServer } from "node:http";
import { connect } from "node:http2";
import https, { createServer as createHttpsServer } from "node:https";
import { createHttpTerminator } from "http-terminator";
import { getAccessibleHosts } from "miniflare";
import serveStatic from "serve-static";
import { getHttpsOptions } from "../https-options";
import { logger } from "../logger";
import { getAccessToken } from "../user/access";
import { castAsAbortError, isAbortError } from "../utils/isAbortError";
import type { CfPreviewToken } from "./create-worker-preview";
import type { HttpTerminator } from "http-terminator";
import type {
	Server as HttpServer,
	IncomingHttpHeaders,
	IncomingMessage,
	RequestListener,
	ServerResponse,
} from "node:http";
import type { ClientHttp2Session, ServerHttp2Stream } from "node:http2";
import type { Server as HttpsServer } from "node:https";
import type { Duplex, Writable } from "node:stream";

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

async function addCfAccessToken(
	headers: IncomingHttpHeaders,
	domain: string,
	accessTokenRef: { current: string | undefined | null }
) {
	if (accessTokenRef.current === null) {
		return;
	}
	if (typeof accessTokenRef.current === "string") {
		headers["cookie"] =
			`${headers["cookie"]};CF_Authorization=${accessTokenRef.current}`;
		return;
	}
	const token = await getAccessToken(domain);
	accessTokenRef.current = token;
	if (token) {
		headers["cookie"] =
			`${headers["cookie"]};CF_Authorization=${accessTokenRef.current}`;
	}
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

function writeHead(
	socket: Writable,
	res: Pick<
		IncomingMessage,
		"httpVersion" | "statusCode" | "statusMessage" | "headers"
	>
) {
	socket.write(
		`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}\r\n`
	);
	for (const [key, values] of Object.entries(res.headers)) {
		if (Array.isArray(values)) {
			for (const value of values) {
				socket.write(`${key}: ${value}\r\n`);
			}
		} else {
			socket.write(`${key}: ${values}\r\n`);
		}
	}
	socket.write("\r\n");
}

type PreviewProxy = {
	server: HttpServer | HttpsServer;
	terminator: HttpTerminator;
};

export async function startPreviewServer({
	previewToken,
	assetDirectory,
	localProtocol,
	customHttpsKeyPath,
	customHttpsCertPath,
	localPort: port,
	ip,
	onReady,
}: {
	previewToken: CfPreviewToken;
	assetDirectory: string | undefined;
	localProtocol: "https" | "http";
	customHttpsKeyPath: string | undefined;
	customHttpsCertPath: string | undefined;
	localPort: number;
	ip: string;
	onReady: ((readyIp: string, readyPort: number) => void) | undefined;
}) {
	try {
		const abortController = new AbortController();

		const server = await createProxyServer(
			localProtocol,
			customHttpsKeyPath,
			customHttpsCertPath
		);
		const proxy = {
			server,
			terminator: createHttpTerminator({
				server,
				gracefulTerminationTimeout: 0,
			}),
		};

		// We have a token. Let's proxy requests to the preview end point.
		const streamBufferRef = { current: [] };
		const requestResponseBufferRef = { current: [] };
		const accessTokenRef = { current: undefined };
		const cleanupListeners = configureProxyServer({
			proxy,
			previewToken,
			streamBufferRef,
			requestResponseBufferRef,
			retryServerSetup: () => {}, // no-op outside of React
			assetDirectory,
			localProtocol,
			port,
			accessTokenRef,
		});

		await waitForPortToBeAvailable(port, ip, {
			retryPeriod: 200,
			timeout: 2000,
			abortSignal: abortController.signal,
		});

		proxy.server.on("listening", () => {
			const address = proxy.server.address();
			const usedPort =
				address && typeof address === "object" ? address.port : port;
			logger.log(`⬣ Listening at ${localProtocol}://${ip}:${usedPort}`);
			const accessibleHosts = [];
			if (ip === "::" || ip === "*" || ip === "0.0.0.0") {
				accessibleHosts.push(...getAccessibleHosts(true));

				if (ip !== "0.0.0.0") {
					accessibleHosts.push("localhost");
					accessibleHosts.push("[::1]");
				}
			}
			for (const accessibleHost of accessibleHosts) {
				logger.log(`- ${localProtocol}://${accessibleHost}:${usedPort}`);
			}
			onReady?.(ip, usedPort);
		});

		proxy.server.listen(port, ip);
		return {
			stop: () => {
				abortController.abort();
				cleanupListeners?.forEach((cleanup) => cleanup());
			},
		};
	} catch (err) {
		if (isAbortError(err)) {
			logger.error(`Failed to start server: ${err}`);
		}
		logger.error("Failed to create proxy server:", err);
	}
}

function configureProxyServer({
	proxy,
	previewToken,
	streamBufferRef,
	requestResponseBufferRef,
	retryServerSetup,
	port,
	localProtocol,
	assetDirectory,
	accessTokenRef,
}: {
	proxy: PreviewProxy | undefined;
	previewToken: CfPreviewToken | undefined;
	// normally the type of streamBufferRef should be
	// React.MutableRefObject<T>, but we don't want to require react
	streamBufferRef: {
		current: { stream: ServerHttp2Stream; headers: IncomingHttpHeaders }[];
	};
	// normally the type of requestResponseBufferRef should be
	// React.MutableRefObject<T>, but we don't want to require react
	requestResponseBufferRef: {
		current: { request: IncomingMessage; response: ServerResponse }[];
	};
	retryServerSetup: () => void;
	port: number;
	localProtocol: "https" | "http";
	assetDirectory: string | undefined;
	accessTokenRef: { current: string | null | undefined };
}) {
	if (proxy === undefined) {
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
		proxy.server.on("stream", bufferStream);
		cleanupListeners.push(() => proxy.server.off("stream", bufferStream));

		const bufferRequestResponse = (
			request: IncomingMessage,
			response: ServerResponse
		) => {
			// store the request and response in a buffer so we can replay it later
			requestResponseBufferRef.current.push({ request, response });
		};

		proxy.server.on("request", bufferRequestResponse);
		cleanupListeners.push(() =>
			proxy.server.off("request", bufferRequestResponse)
		);
		return cleanupListeners;
	}

	// We have a token. Let's proxy requests to the preview end point.
	const cleanupListeners: (() => void)[] = [];

	// create a ClientHttp2Session
	logger.debug("PREVIEW URL:", `https://${previewToken.host}`);
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
		localProtocol,
		accessTokenRef
	);
	proxy.server.on("stream", handleStream);
	cleanupListeners.push(() => proxy.server.off("stream", handleStream));

	// flush and replay buffered streams
	streamBufferRef.current.forEach(
		(buffer: { stream: ServerHttp2Stream; headers: IncomingHttpHeaders }) =>
			handleStream(buffer.stream, buffer.headers)
	);
	streamBufferRef.current = [];

	/** HTTP/1 -> HTTP/2  */
	const handleRequest: RequestListener = async (
		message: IncomingMessage,
		response: ServerResponse
	) => {
		const { httpVersionMajor, headers, method, url } = message;
		if (httpVersionMajor >= 2) {
			return; // Already handled by the "stream" event.
		}
		await addCfAccessToken(headers, previewToken.host, accessTokenRef);
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
		logger.debug(
			"WORKER REQUEST",
			new Date().toLocaleTimeString(),
			method,
			url
		);
		logger.debugWithSanitization("HEADERS", JSON.stringify(headers, null, 2));
		logger.debugWithSanitization("PREVIEW TOKEN", previewToken);

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
	const actualHandleRequest = assetDirectory
		? createHandleAssetsRequest(assetDirectory, handleRequest)
		: handleRequest;

	proxy.server.on("request", actualHandleRequest);
	cleanupListeners.push(() => proxy.server.off("request", actualHandleRequest));

	// flush and replay buffered requests
	requestResponseBufferRef.current.forEach(
		({
			request,
			response,
		}: {
			request: IncomingMessage;
			response: ServerResponse;
		}) => actualHandleRequest(request, response)
	);
	requestResponseBufferRef.current = [];

	/** HTTP/1 -> WebSocket (over HTTP/1)  */
	const handleUpgrade = async (
		originalMessage: IncomingMessage,
		originalSocket: Duplex,
		originalHead: Buffer
	) => {
		const { headers, method, url } = originalMessage;
		await addCfAccessToken(headers, previewToken.host, accessTokenRef);
		addCfPreviewTokenHeader(headers, previewToken.value);
		headers["host"] = previewToken.host;

		if (originalHead?.byteLength) {
			originalSocket.unshift(originalHead);
		}

		const runtimeRequest = https.request(
			{
				hostname: previewToken.host,
				path: url,
				method,
				headers,
			},
			(runtimeResponse) => {
				if (!(runtimeResponse as { upgrade?: boolean }).upgrade) {
					writeHead(originalSocket, runtimeResponse);
					runtimeResponse.pipe(originalSocket);
				}
			}
		);

		runtimeRequest.on(
			"upgrade",
			(runtimeResponse, runtimeSocket, runtimeHead) => {
				if (runtimeHead?.byteLength) {
					runtimeSocket.unshift(runtimeHead);
				}
				writeHead(originalSocket, {
					httpVersion: "1.1",
					statusCode: 101,
					statusMessage: "Switching Protocols",
					headers: runtimeResponse.headers,
				});
				runtimeSocket.pipe(originalSocket).pipe(runtimeSocket);
			}
		);
		originalMessage.pipe(runtimeRequest);
	};

	proxy.server.on("upgrade", handleUpgrade);
	cleanupListeners.push(() => proxy.server.off("upgrade", handleUpgrade));
	return cleanupListeners;
}

function createHandleAssetsRequest(
	assetDirectory: string,
	handleRequest: RequestListener
) {
	const handleAsset = serveStatic(assetDirectory, {
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
	localProtocol: "https" | "http",
	customHttpsKeyPath: string | undefined,
	customHttpsCertPath: string | undefined
): Promise<HttpServer | HttpsServer> {
	const server: HttpServer | HttpsServer =
		localProtocol === "https"
			? createHttpsServer(
					await getHttpsOptions(customHttpsKeyPath, customHttpsCertPath)
				)
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
	localProtocol: "https" | "http",
	accessTokenRef: { current: string | undefined | null }
) {
	return async function handleStream(
		stream: ServerHttp2Stream,
		headers: IncomingHttpHeaders
	) {
		await addCfAccessToken(headers, previewToken.host, accessTokenRef);
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
	host: string,
	options: { retryPeriod: number; timeout: number; abortSignal: AbortSignal }
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (host === "*") {
			host = "0.0.0.0";
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		options.abortSignal.addEventListener("abort", () => {
			const abortError = new Error("waitForPortToBeAvailable() aborted");
			castAsAbortError(abortError);
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
			if (port === 0) {
				doResolve();
				return;
			}

			// Testing whether a port is 'available' involves simply
			// trying to make a server listen on that port, and retrying
			// until it succeeds.
			const server = createHttpServer();
			const terminator = createHttpTerminator({
				server,
				gracefulTerminationTimeout: 0, // default 1000
			});

			server.on("error", (err) => {
				// @ts-expect-error non standard property on Error
				if (err.code !== "EADDRINUSE") {
					doReject(err);
				}
			});
			server.listen(port, host, () =>
				terminator
					.terminate()
					.then(doResolve, () =>
						logger.error("Failed to terminate the port checker.")
					)
			);
		}
	});
}
