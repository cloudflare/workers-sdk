import assert from "node:assert";
import http from "node:http";
import path from "node:path";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

export let viteServer: ViteDevServer;
export let viteTestUrl: string;

// Dummy server that occupies a port so that Vite must bump to the next one
let blocker: http.Server;
export const CONFIGURED_PORT = 15_173;

export async function preServe() {
	// Occupy the port that Vite is configured to use on 127.0.0.1.
	// The Vite server config below also specifies host: "127.0.0.1" so
	// both compete for the exact same address, guaranteeing a conflict
	// regardless of platform or IPv4/IPv6 dual-stack behaviour.
	blocker = http.createServer((_req, res) => {
		res.writeHead(200);
		res.end();
	});
	await new Promise<void>((resolve) =>
		blocker.listen(CONFIGURED_PORT, "127.0.0.1", resolve)
	);
}

export async function serve() {
	const server = await createServer({
		root: path.resolve(__dirname, ".."),
		logLevel: "silent",
		server: {
			// Pin to the same address as the blocker so Vite must bump the port
			host: "127.0.0.1",
			port: CONFIGURED_PORT,
			strictPort: false,
		},
	});
	viteServer = await server.listen();
	assert(viteServer.resolvedUrls);
	assert(viteServer.resolvedUrls.local[0]);
	viteTestUrl = viteServer.resolvedUrls.local[0].replace(/\/$/, "");
	return viteServer;
}

export async function postServe() {
	blocker?.close();
}
