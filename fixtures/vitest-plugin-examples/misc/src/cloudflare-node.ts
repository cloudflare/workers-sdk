import http from "node:http";
import { httpServerHandler } from "cloudflare:node";

const server = http.createServer((_, response) => {
	response.end("Hello from an httpServerHandler");
});

server.listen(8080);

export default httpServerHandler({ port: 8080 });
