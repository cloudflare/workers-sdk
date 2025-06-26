const { createServer } = require("http");

// Create HTTP server
const server = createServer(function (req, res) {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.write("Hello World! " + process.env.MESSAGE);
	res.end();
});

server.listen(8080, function () {
	console.log("Server listening on port 8080");
});
