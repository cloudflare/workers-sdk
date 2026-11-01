import assert from "node:assert";
import http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, test } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";

const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "proxy-websockets");

// https://github.com/cloudflare/workers-sdk/issues/16638
describe("dev server WebSocket proxy rules", () => {
	const roots: string[] = [];
	let upstreamServer: http.Server;
	let upstreamWebSocketServer: WebSocketServer;
	let viteServer: ViteDevServer | undefined;

	/**
	 * Creates a Worker fixture that owns no WebSocket routes: like the frontend
	 * Worker in the linked reproduction, it returns 404 for every request.
	 */
	function createWorkerRoot(): string {
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		const root = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);
		roots.push(root);
		fs.mkdirSync(path.join(root, "src"));
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  worker: {",
				"    name: 'worker',",
				"    entrypoint: './src/index.ts',",
				"    compatibilityDate: '2024-12-30',",
				"  },",
				"});",
			].join("\n")
		);
		fs.writeFileSync(
			path.join(root, "src/index.ts"),
			"export default { fetch: () => new Response('Not Found', { status: 404 }) };"
		);
		return root;
	}

	/**
	 * Starts the local HTTP/WebSocket upstream that the Vite proxy rule
	 * forwards `/graphql` to, standing in for the reporter's API server. The
	 * upstream completes the WebSocket handshake and sends a frame after a
	 * short delay, so a socket destroyed mid-flight never delivers it.
	 */
	async function startUpstream(): Promise<number> {
		upstreamWebSocketServer = new WebSocketServer({ noServer: true });
		upstreamWebSocketServer.on("connection", (ws) => {
			setTimeout(() => {
				if (!ws.closed) {
					ws.send("connection_ack");
				}
			}, 500);
		});
		upstreamServer = http.createServer((_req, res) => res.end("upstream"));
		upstreamServer.on("upgrade", (request, socket, head) => {
			upstreamWebSocketServer.handleUpgrade(request, socket, head, (ws) => {
				upstreamWebSocketServer.emit("connection", ws, request);
			});
		});
		await new Promise<void>((resolve) =>
			upstreamServer.listen(0, "127.0.0.1", resolve)
		);
		return (upstreamServer.address() as AddressInfo).port;
	}

	/**
	 * Starts a Vite dev server with the Cloudflare plugin, forwarding
	 * `/graphql` to the upstream with WebSocket support while disabling Vite's
	 * own HMR WebSocket server, exactly as in the linked reproduction.
	 */
	async function startViteServer(): Promise<number> {
		const upstreamPort = await startUpstream();
		viteServer = await createServer({
			root: createWorkerRoot(),
			configFile: false,
			logLevel: "silent",
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					remoteBindings: false,
				}),
			],
			server: {
				host: "127.0.0.1",
				proxy: {
					"/graphql": {
						target: `http://127.0.0.1:${upstreamPort}`,
						ws: true,
					},
				},
				ws: false,
			},
		});
		await viteServer.listen(0);
		const address = viteServer.httpServer?.address();
		assert(address, "Expected the Vite dev server to have an HTTP server");
		return (address as AddressInfo).port;
	}

	afterEach(async () => {
		await viteServer?.close();
		viteServer = undefined;
		await new Promise<void>((resolve, reject) =>
			upstreamWebSocketServer.close(() => {
				upstreamServer.closeAllConnections();
				upstreamServer.close((e) => (e ? reject(e) : resolve()));
			})
		);
		for (const root of roots.splice(0)) {
			removeDirSync(root);
		}
	});

	test("HTTP requests matching a server.proxy rule reach the upstream", async ({
		expect,
	}) => {
		const port = await startViteServer();
		const response = await fetch(`http://127.0.0.1:${port}/graphql`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("upstream");
	});

	test("WebSocket upgrades matching a server.proxy ws rule are left to Vite", async ({
		expect,
	}) => {
		const port = await startViteServer();

		// Warm the Worker up first, so its (non-WebSocket) response to the
		// later upgrade request comes back within milliseconds rather than
		// after the workerd cold start. Otherwise the race between the Worker
		// response destroying the socket and the upstream frame arriving is
		// too close to be deterministic.
		await fetch(`http://127.0.0.1:${port}/`);

		const socket = new WebSocket(
			`ws://127.0.0.1:${port}/graphql`,
			"graphql-transport-ws"
		);
		// The client uses the graphql-transport-ws subprotocol, deliberately
		// not a `vite`-prefixed one, so the upgrade is not Vite's HMR socket.
		// All listeners are attached before the handshake completes: the frame
		// can arrive in the same tick as `open`.
		const opened = new Promise<void>((resolve, reject) => {
			socket.on("open", () => resolve());
			socket.on("error", (error) =>
				reject(new Error(`WebSocket failed to open: ${error}`))
			);
		});
		// Wait for the frame the upstream sends after the handshake, mirroring
		// the linked reproduction: today the Worker's 404 response makes the
		// plugin's upgrade handler destroy the socket Vite's proxy claimed.
		const firstFrame = new Promise<string>((resolve, reject) => {
			socket.on("message", (data) => resolve(data.toString()));
			socket.on("close", (code) =>
				reject(
					new Error(`WebSocket closed before a frame arrived (code ${code})`)
				)
			);
			socket.on("error", (error) =>
				reject(new Error(`WebSocket error: ${error}`))
			);
			setTimeout(
				() => reject(new Error("Timed out waiting for a frame")),
				10_000
			);
		});
		await opened;
		expect(await firstFrame).toBe("connection_ack");

		socket.close();
	});
});
