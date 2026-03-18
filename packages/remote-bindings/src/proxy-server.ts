import http from "node:http";
import https from "node:https";
import type { PreviewToken } from "./types";
import type { Duplex } from "node:stream";

/**
 * A minimal HTTP/WebSocket proxy that adds the preview token header
 * and forwards requests to the Cloudflare edge host.
 *
 * This replaces the full ProxyController + Miniflare instance that
 * wrangler previously used. It handles:
 * 1. HTTP request proxying with auth headers
 * 2. WebSocket upgrade proxying with auth headers
 * 3. Token refresh (caller updates the token via setToken())
 */
export class ProxyServer {
	#server: http.Server;
	#token: PreviewToken;
	#port: number;
	#ready: Promise<void>;

	constructor(token: PreviewToken, port: number) {
		this.#token = token;
		this.#port = port;

		this.#server = http.createServer(this.#handleRequest.bind(this));
		this.#server.on("upgrade", this.#handleUpgrade.bind(this));

		this.#ready = new Promise((resolve, reject) => {
			const onError = (err: Error) => {
				reject(err);
			};
			this.#server.on("error", onError);
			this.#server.listen(this.#port, "127.0.0.1", () => {
				// Remove the startup error listener — runtime errors
				// are non-fatal and shouldn't reject the ready promise
				this.#server.removeListener("error", onError);
				resolve();
			});
		});
	}

	get ready(): Promise<void> {
		return this.#ready;
	}

	get url(): string {
		return `http://127.0.0.1:${this.#port}`;
	}

	/**
	 * Update the preview token (e.g., after token refresh).
	 */
	setToken(token: PreviewToken): void {
		this.#token = token;
	}

	async dispose(): Promise<void> {
		// Force-close all active connections (including WebSockets)
		// so that server.close() can complete. Without this, close()
		// waits for all connections to finish, which hangs indefinitely
		// when WebSocket connections are active.
		this.#server.closeAllConnections();

		return new Promise((resolve, reject) => {
			this.#server.close((err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	/**
	 * Handle an HTTP request by proxying it to the edge host.
	 */
	#handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const edgeUrl = new URL(req.url ?? "/", `https://${this.#token.host}`);

		const headers: Record<string, string | string[]> = {};
		// Copy incoming headers
		for (const [key, value] of Object.entries(req.headers)) {
			if (value !== undefined) {
				headers[key] = value;
			}
		}
		// Inject auth
		headers["cf-workers-preview-token"] = this.#token.value;
		// Remove host header — we're changing the target
		delete headers["host"];

		const proxyReq = https.request(
			edgeUrl,
			{
				method: req.method,
				headers,
			},
			(proxyRes) => {
				res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
				proxyRes.pipe(res, { end: true });
			}
		);

		proxyReq.on("error", () => {
			if (!res.headersSent) {
				res.writeHead(502);
			}
			res.end();
			req.destroy();
		});

		req.on("error", () => {
			proxyReq.destroy();
		});

		req.pipe(proxyReq, { end: true });
	}

	/**
	 * Handle a WebSocket upgrade by proxying it to the edge host.
	 * Forwards the full handshake response from the edge (including
	 * Sec-WebSocket-Accept and other headers required by RFC 6455).
	 */
	#handleUpgrade(
		req: http.IncomingMessage,
		clientSocket: Duplex,
		head: Buffer
	): void {
		const edgeUrl = new URL(req.url ?? "/", `https://${this.#token.host}`);

		const headers: Record<string, string | string[]> = {};
		for (const [key, value] of Object.entries(req.headers)) {
			if (value !== undefined) {
				headers[key] = value;
			}
		}
		headers["cf-workers-preview-token"] = this.#token.value;
		delete headers["host"];

		const options: https.RequestOptions = {
			hostname: edgeUrl.hostname,
			port: 443,
			path: edgeUrl.pathname + edgeUrl.search,
			method: "GET",
			headers,
		};

		const proxyReq = https.request(options);

		proxyReq.on("response", (proxyRes) => {
			let responseHead = `HTTP/1.1 ${proxyRes.statusCode ?? 502} ${proxyRes.statusMessage ?? "Bad Gateway"}\r\n`;
			for (const [key, value] of Object.entries(proxyRes.headers)) {
				if (value === undefined) {
					continue;
				}
				if (Array.isArray(value)) {
					for (const v of value) {
						responseHead += `${key}: ${v}\r\n`;
					}
				} else {
					responseHead += `${key}: ${value}\r\n`;
				}
			}
			responseHead += "\r\n";
			clientSocket.write(responseHead);
			proxyRes.pipe(clientSocket);
			proxyRes.on("end", () => clientSocket.end());
			proxyRes.on("error", () => clientSocket.destroy());
		});

		proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
			// Build the 101 response from the edge's actual headers
			// (includes Sec-WebSocket-Accept, extensions, protocol, etc.)
			let responseHead = `HTTP/1.1 101 Switching Protocols\r\n`;
			for (const [key, value] of Object.entries(proxyRes.headers)) {
				if (value === undefined) {
					continue;
				}
				if (Array.isArray(value)) {
					for (const v of value) {
						responseHead += `${key}: ${v}\r\n`;
					}
				} else {
					responseHead += `${key}: ${value}\r\n`;
				}
			}
			responseHead += "\r\n";
			clientSocket.write(responseHead);

			if (proxyHead.length > 0) {
				clientSocket.write(proxyHead);
			}
			if (head.length > 0) {
				proxySocket.write(head);
			}

			// Relay data bidirectionally
			proxySocket.pipe(clientSocket);
			clientSocket.pipe(proxySocket);

			proxySocket.on("error", () => clientSocket.destroy());
			clientSocket.on("error", () => proxySocket.destroy());
			proxySocket.on("close", () => clientSocket.destroy());
			clientSocket.on("close", () => proxySocket.destroy());
		});

		proxyReq.on("error", () => {
			clientSocket.destroy();
		});

		proxyReq.end();
	}
}
