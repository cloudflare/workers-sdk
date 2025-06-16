interface Env {
	WORKER: typeof import("../../main-worker/src/index").default;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		switch (url.pathname) {
			case "/streaming":
			case "/fixed-length":
				return env.WORKER.fetch(request);
			case "google": {
				const response = await fetch("https://google.com", {
					redirect: "manual",
					headers: request.headers,
				});
				const newResponse = new Response(response.body, {
					...response,
					headers: { ...response.headers, "content-encoding": "identity" },
				});
				return newResponse;
			}
			case "/igor": {
				const response = await fetch("https://ping.igor-dev.workers.dev/", {
					redirect: "manual",
					headers: request.headers,
				});
				const newResponse = new Response(response.body, {
					...response,
					// headers: { ...response.headers, "content-encoding": "identity" },
				});
				return newResponse;
			}
			default:
				return new Response(
					`
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8" />
				<title>Streaming Example</title>
			</head>
			<body>
				<h1>Streaming Example</h1>
				<p>Use the <code>/streaming</code> endpoint to see streaming responses.</p>
				<ul>
					<li><code>compression</code>: Set to <code>gzip</code> for gzip compression, <code>br</code> for no brotli compression, leave empty for no compression.</li>
					<li><code>iterations</code>: Number of chunks to send (default is 5).</li>
					<li><code>pause</code>: Time in milliseconds to wait between chunks (default is 500).</li>
					<li><code>chunksize</code>: Size of each chunk in bytes (default is 500).</li>
				</ul>
				<p>Examples:</p>
				<ul>
					<li><a href="/streaming">Default - no compression</a></li>
					<li><a href="/streaming?compression=gzip">gzip compression</a></li>
					<li><a href="/streaming?compression=gzip&iterations=50&pause=100&chunksize=1000">gzip lots of large chunks</a></li>
					<li><a href="/streaming?compression=br">brotli compression</a></li>
					<li><a href="/streaming?compression=br&iterations=50&pause=100&chunksize=1000">brotli lots of large chunks</a></li>
				</ul>
			</body>
			</html>
			`,
					{ headers: { "content-type": "text/html" } }
				);
		}
	},
};
