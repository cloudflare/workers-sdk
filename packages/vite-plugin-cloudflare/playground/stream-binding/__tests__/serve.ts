import http from "node:http";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

export let viteServer: ViteDevServer;
export let viteTestUrl: string;

// Dummy server that occupies a port so that Vite must bump to the next one
let blocker: http.Server;
let blockerPort: number;
export const CONFIGURED_PORT = 15_173;

export async function preServe() {
	// Occupy the port that Vite is configured to use
	blocker = http.createServer((_req, res) => {
		res.writeHead(200);
		res.end();
	});
	await new Promise<void>((resolve) =>
		blocker.listen(CONFIGURED_PORT, "127.0.0.1", resolve)
	);
	const addr = blocker.address();
	blockerPort =
		typeof addr === "object" && addr !== null ? addr.port : CONFIGURED_PORT;
	console.log(`Port blocker listening on ${blockerPort}`);
}

export async function serve() {
	const rootDir = path.resolve(__dirname, "..");
	const server = await createServer({
		root: rootDir,
		logLevel: "silent",
		configFile: path.resolve(rootDir, "vite.config.ts"),
		server: {
			// Request the same port as the blocker — Vite will have to bump
			port: CONFIGURED_PORT,
			strictPort: false,
		},
		plugins: [cloudflare({ inspectorPort: false, persistState: false })],
	});
	viteServer = await server.listen();
	// oxlint-disable-next-line typescript/no-non-null-assertion
	viteTestUrl = viteServer.resolvedUrls!.local[0]!.replace(/\/$/, "");
	console.log(
		`Vite dev server listening at ${viteTestUrl} (requested port ${CONFIGURED_PORT})`
	);
	return viteServer;
}

export async function postServe() {
	blocker?.close();
}
