import { createServer } from "http";

const server = createServer();

server.on("request", (req, res) => {
	res.write("Host:" + req.headers.host);
	res.end();
});

server.listen(8791);
