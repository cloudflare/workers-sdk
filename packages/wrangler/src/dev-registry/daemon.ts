import assert from "node:assert";
import events from "node:events";
import http from "node:http";
import consumers from "node:stream/consumers";
import { WebSocket, WebSocketServer } from "ws";
import {
	DEV_REGISTRY_DAEMON_EXIT_TIMEOUT,
	DEV_REGISTRY_PORT,
} from "./constants";
import type {
	WorkerDefinition,
	WorkerRegistry,
	WorkerRegistryDaemonMessage,
} from "./constants";

// -----------------------------------------------------------------------------
// REGISTRY
// -----------------------------------------------------------------------------
let workers: WorkerRegistry = {};

// -----------------------------------------------------------------------------
// AUTO-EXIT TIMEOUT
// -----------------------------------------------------------------------------
let exitTimeout: NodeJS.Timeout | undefined;
let exitTime: number | undefined;
function resetExitTimeout() {
	clearTimeout(exitTimeout);
	exitTime = undefined;

	// If we have any connected WebSocket clients, don't exit
	for (const client of wsServer.clients) {
		if (client.readyState <= WebSocket.OPEN) return;
	}

	exitTimeout = setTimeout(exit, DEV_REGISTRY_DAEMON_EXIT_TIMEOUT);
	exitTime = Date.now() + DEV_REGISTRY_DAEMON_EXIT_TIMEOUT;
}
function exit() {
	process.exit(0);
}

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------
function matchWorkersId(url: URL): { id?: string } | undefined {
	const match = /^\/workers\/(?<id>[^/]+)?\/?$/.exec(url.pathname);
	if (match === null) return;
	return { id: match.groups?.id };
}

// -----------------------------------------------------------------------------
// WEBSOCKET HANDLERS
// -----------------------------------------------------------------------------
const wsServer = new WebSocketServer({ noServer: true });
function broadcastWorkers() {
	const stringifiedWorkers = JSON.stringify(workers);
	for (const client of wsServer.clients) {
		if (client.readyState === WebSocket.OPEN) client.send(stringifiedWorkers);
	}
}
wsServer.on("connection", (ws, req) => {
	assert.strictEqual(ws.readyState, WebSocket.OPEN);

	const url = new URL(req.url ?? "", "http://localhost/");
	const idMatch = matchWorkersId(url);
	if (idMatch?.id === undefined) return ws.close(1002);
	const id = idMatch.id;
	resetExitTimeout();

	// Send current registrations on connect
	ws.send(JSON.stringify(workers));

	ws.on("message", (data) => {
		// Update ID's registration, and send updated registrations to all clients
		workers[id] = JSON.parse(data.toString());
		broadcastWorkers();
	});

	ws.on("close", () => {
		// Remove ID's registration, and send updated registrations to all clients
		delete workers[id];
		broadcastWorkers();
		resetExitTimeout();
	});
});

// -----------------------------------------------------------------------------
// REGULAR HTTP HANDLERS (BACK COMPAT)
// -----------------------------------------------------------------------------
function htmlResponse(res: http.ServerResponse, value: string) {
	res.writeHead(200, { "content-type": "text/html;charset=utf-8" });
	res.end(value);
}
function jsonResponse(res: http.ServerResponse, value: unknown) {
	res.writeHead(200, { "content-type": "application/json;charset=utf-8" });
	res.end(JSON.stringify(value));
}
function notFoundResponse(res: http.ServerResponse) {
	res.writeHead(404);
	res.end();
}
const requestListener: http.RequestListener = async (req, res) => {
	const url = new URL(req.url ?? "", "http://localhost/");
	if (req.method === "GET" && url.pathname === "/") {
		// GET /
		return htmlResponse(
			res,
			`<!doctype html>
			<html lang="en">
			<head>
				<title>Wrangler Service Registry</title>
				<meta http-equiv="refresh" content="1" >
				<style>body { font-family: sans-serif; }</style>
			</head>
			<body>
				<h1>🤠 Wrangler Service Registry</h1>
				<p>Connected WebSocket Client(s): ${wsServer.clients.size}</p>
				<p>Scheduled Exit Time: ${
					exitTime === undefined
						? "&lt;none&gt;"
						: `in ${Math.round((exitTime - Date.now()) / 1000)}s`
				}</p>
				<pre>${JSON.stringify(workers, null, 2)}</pre>
			</body>
			</html>`
		);
	}

	resetExitTimeout();
	const idMatch = matchWorkersId(url);
	if (req.method === "GET" && idMatch?.id === undefined) {
		// GET /workers
		return jsonResponse(res, workers);
	} else if (req.method === "POST" && idMatch?.id !== undefined) {
		// POST /workers/:id
		workers[idMatch.id] = (await consumers.json(req)) as WorkerDefinition;
		broadcastWorkers();
		return jsonResponse(res, null);
	} else if (req.method === "DELETE" && idMatch !== undefined) {
		// DELETE /workers/:id?
		if (idMatch.id === undefined) workers = {};
		else delete workers[idMatch.id];
		broadcastWorkers();
		return jsonResponse(res, null);
	} else {
		return notFoundResponse(res);
	}
};

// -----------------------------------------------------------------------------
// ENTRYPOINT
// -----------------------------------------------------------------------------
async function start() {
	const server = http.createServer(requestListener);
	server.on("upgrade", (req, socket, head) => {
		wsServer.handleUpgrade(req, socket, head, (ws) => {
			wsServer.emit("connection", ws, req);
		});
	});
	try {
		server.listen(DEV_REGISTRY_PORT);
		await events.once(server, "listening");
		process.send?.(<WorkerRegistryDaemonMessage>{ type: "ready" });
		resetExitTimeout();
	} catch (error) {
		process.send?.(<WorkerRegistryDaemonMessage>{ type: "error", error });
		process.exitCode = 1;
	} finally {
		process.disconnect();
	}
}
if (require.main === module) void start();
