import { createServer } from "http";
import { WebSocketServer } from "ws";

const server = createServer();
const wsServer = new WebSocketServer({ noServer: true });

wsServer.on("connection", function connection(ws) {
	ws.on("message", (msg) => console.log(msg));
});

server.on("upgrade", (request, socket, head) => {
	wsServer.handleUpgrade(request, socket, head, (ws) => {
		wsServer.emit("connection", ws, request);
	});
});

server.on("request", (_request, res) => {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.writeHead(200, { "X-Proxied": "true" });
	res.write("Hello, world!");
	res.end();
});

server.listen(8791);
