const http = require("node:http");

// An inert stand-in for Chrome: announce a DevTools endpoint and report only
// the environment values the launcher test deliberately supplies.
const server = http.createServer((_request, response) => {
	response.setHeader("Content-Type", "application/json");
	response.end(
		JSON.stringify({
			home: process.env.HOME,
			configuration: Object.fromEntries(
				[
					"XDG_CONFIG_HOME",
					"XDG_CACHE_HOME",
					"XDG_DATA_HOME",
					"XDG_RUNTIME_DIR",
					"CHROME_CONFIG_HOME",
					"CHROME_DEVEL_SANDBOX",
					"SSL_CERT_FILE",
					"SSL_CERT_DIR",
					"HTTP_PROXY",
					"HTTPS_PROXY",
					"ALL_PROXY",
					"NO_PROXY",
					"http_proxy",
					"https_proxy",
					"all_proxy",
					"no_proxy",
					"DISPLAY",
					"WAYLAND_DISPLAY",
					"XAUTHORITY",
					"FONTCONFIG_PATH",
					"LANG",
					"LC_ALL",
					"TZ",
				].map((name) => [name, process.env[name]])
			),
			credentials: {
				cloudflare: process.env.CLOUDFLARE_API_TOKEN,
				aws: process.env.AWS_SECRET_ACCESS_KEY,
				github: process.env.GITHUB_TOKEN,
				custom: process.env.MINIFLARE_BROWSER_TEST,
				xdg: process.env.XDG_TEST_TOKEN,
				chrome: process.env.CHROME_TEST_TOKEN,
				proxy: process.env.HTTP_PROXY_TOKEN,
				nodeOptions: process.env.NODE_OPTIONS,
			},
			args: process.argv.slice(2),
		})
	);
});
server.listen(0, "127.0.0.1", () => {
	process.stderr.write(
		`DevTools listening on ws://127.0.0.1:${server.address().port}/devtools/browser/test\n`
	);
});
