/**
 * This file defines the Node.js based server that runs on a Cloudedit Container instance
 * It is entirely unauthenticated, and relies on a DO sitting in front for access control
 * It's intended to be used as a single instance backing a Cloudedit session—1:1 with a user
 * Several endpoints are exposed:
 *  - /fs is a WebSocket endpoint that exposes a read/write API for the filesystem. As well as
 *    allowing clients to write to the filesystem of the Container, it sends events over the connection
 *    when files are changed (by e.g. a command running on the Container). Fairly basic last-write-wins
 *    semantics are used for conflict resolution. Only a single client can be connected at any given
 *    time, and a new client connection will remove the old one.
 *  - /terminal is a WebSocket endpoint that exposes a node-pty based terminal, intended to be used with
 *    an xTerm.js client. This allows clients to execute arbitrary shell commands on the Container.
 *    Only a single client can be connected at any given time, and a new client connection will remove
 *    the old one and close the spawned `sh` process.
 *  - POST /resize-terminal is a utility endpoint to resize the acitve terminal to reflect a client resize
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chdir, cwd } from "node:process";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { FSWatcher, watch } from "chokidar";
import { Hono, HonoRequest } from "hono";
import { HTTPException } from "hono/http-exception";

// import pty from "node-pty";

chdir("/app");

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

function parseSize(req: HonoRequest) {
	const cols = req.query("cols");
	const rows = req.query("rows");
	if (!rows || !cols) {
		throw new HTTPException(400);
	}

	return { cols: parseInt(cols), rows: parseInt(rows) };
}

app.post("/resize-terminal", (c) => {
	const { cols, rows } = parseSize(c.req);
	if (!activeTerminal) {
		throw new HTTPException(500, { message: "No active terminal" });
	}
	activeTerminal.resize(cols, rows);

	return c.text("Successfully resized terminal");
});

let activeTerminal: import("node-pty").IPty | undefined;
let activeTerminalWs: any | undefined;

app.get(
	"/terminal",
	upgradeWebSocket((c) => ({
		async onOpen(_event, ws) {
			activeTerminalWs?.close();
			activeTerminal?.kill();

			activeTerminalWs = ws;
			const { cols, rows } = parseSize(c.req);
			const env = { ...process.env };
			env["COLORTERM"] = "truecolor";
			// env["PS1"] = "\x1B[2m\\w\x1B[22m\\n\\e[0;34m$ \\033[0m";
			env["PS1"] = "> ";
			const pty = await import("node-pty");

			activeTerminal = pty.spawn("sh", [], {
				name: "xterm-256color",
				cols: cols,
				rows: rows,
				cwd: cwd(),
				env,
				encoding: null,
			});
			activeTerminal.onData((d) => ws.send(d));
		},
		onMessage(event: MessageEvent) {
			activeTerminal?.write(event.data);
		},
		onClose: () => {
			activeTerminal?.kill();
		},
	}))
);

let activeWatcher: FSWatcher | undefined;
let activeWatcherWs: any | undefined;

app.get(
	"/fs",
	upgradeWebSocket((c) => ({
		onOpen(_event, ws) {
			activeWatcher?.close();
			activeWatcherWs?.close();
			activeWatcherWs = ws;

			activeWatcher = watch(cwd(), {
				ignored: /node_modules|\.wrangler/,
				persistent: true,
				ignoreInitial: false,
			});
			activeWatcher.on("ready", () => {
				console.log("FS watcher Ready");
			});
			activeWatcher.on("all", (event, filePath) => {
				switch (event) {
					case "add":
						ws.send(
							JSON.stringify({
								type: "add",
								contents: "",
							})
						);
				}
				console.log("FS watcher triggered", event, filePath);
			});
		},
		async onMessage(event: MessageEvent, ws) {
			const { type, path: filePath, contents } = JSON.parse(event.data);
			switch (type) {
				case "add":
					console.log("add", filePath, Buffer.from(contents, "base64"));
					await writeFile(
						path.join(cwd(), filePath),
						Buffer.from(contents, "base64")
					);
					break;
				case "unlink":
					console.log("unlink", filePath);
					break;
				case "change":
					console.log("change", filePath, Buffer.from(contents, "base64"));
					await writeFile(
						path.join(cwd(), filePath),
						Buffer.from(contents, "base64")
					);
					break;
			}
		},
		onClose: () => {
			activeWatcher?.close();
		},
	}))
);

app.get("/running", (c) => {
	return c.text("OK v8");
});

const port = 3125;
console.log(`Server is running on http://localhost:${port}`);

const server = serve({
	fetch: app.fetch,
	port,
	hostname: "0.0.0.0",
});

injectWebSocket(server);
