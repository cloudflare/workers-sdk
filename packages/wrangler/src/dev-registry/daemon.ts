import assert from "node:assert";
import events from "node:events";
import http from "node:http";
import consumers from "node:stream/consumers";
import {
	DEV_REGISTRY_DAEMON_EXIT_TIMEOUT,
	DEV_REGISTRY_PORT,
} from "./constants";
import type {
	WorkerDefinition,
	WorkerRegistry,
	WorkerRegistryDaemonMessage,
} from "./constants";

let workers: WorkerRegistry = {};

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

let exitTimeout: NodeJS.Timeout | undefined;
function resetExitTimeout() {
	clearTimeout(exitTimeout);
	exitTimeout = setTimeout(exit, DEV_REGISTRY_DAEMON_EXIT_TIMEOUT);
}
function exit() {
	process.exit(0);
}

const requestListener: http.RequestListener = async (req, res) => {
	const { pathname } = new URL(req.url ?? "", "http://localhost/");
	let match: RegExpMatchArray | null;
	if (req.method === "GET" && pathname === "/") {
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
				<pre>${JSON.stringify(workers, null, 2)}</pre>
			</body>
			</html>`
		);
	}

	resetExitTimeout();
	if (req.method === "GET" && /^\/workers\/?$/.test(pathname)) {
		// GET /workers
		return jsonResponse(res, workers);
	} else if (
		req.method === "POST" &&
		(match = /^\/workers\/(?<id>[^/]+)\/?$/.exec(pathname)) !== null
	) {
		// POST /workers/:id
		assert(match.groups !== undefined);
		const id: string = match.groups.id;
		workers[id] = (await consumers.json(req)) as WorkerDefinition;
		return jsonResponse(res, null);
	} else if (
		req.method === "DELETE" &&
		(match = /^\/workers\/(?<id>[^/]+)?\/?$/.exec(pathname)) !== null
	) {
		// DELETE /workers/:id?
		const id: string | undefined = match.groups?.id;
		if (id === undefined) {
			workers = {};
		} else {
			delete workers[id];
		}
		return jsonResponse(res, null);
	} else {
		return notFoundResponse(res);
	}
};

async function start() {
	const server = http.createServer(requestListener);
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
