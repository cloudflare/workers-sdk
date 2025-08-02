const { createServer } = require("http");

// Create HTTP server
const server = createServer(function (req, res) {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.write("Hello World! Have an env var! " + process.env.MESSAGE);
	res.end();
});

server.listen(8787, function () {
	console.log("Server listening on port 8080");
});
