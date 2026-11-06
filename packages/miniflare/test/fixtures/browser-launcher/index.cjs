const http = require("node:http");

// An inert stand-in for Chrome: announce a DevTools endpoint and report only
// the environment values the launcher test deliberately supplies.
const server = http.createServer((_request, response) => {
	response.setHeader("Content-Type", "application/json");
	response.end(
		JSON.stringify({
			home: process.env.HOME,
			marker: process.env.MINIFLARE_BROWSER_TEST,
			args: process.argv.slice(2),
		})
	);
});
server.listen(0, "127.0.0.1", () => {
	process.stderr.write(
		`DevTools listening on ws://127.0.0.1:${server.address().port}/devtools/browser/test\n`
	);
});
