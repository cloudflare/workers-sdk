export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		switch (url.pathname) {
			case "/fixed-length":
				return fixedLengthResponse(request);
			case "/streaming":
				return streamingResponse(request);
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

function fixedLengthResponse(request: Request): Response {
	const url = new URL(request.url);
	const compression = url.searchParams.get("compression") ?? "";
	const body =
		'<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body><p>Fixed length response</p></body></html>';
	const bodyStream = ReadableStreamFromString(body);
	const response = new Response(bodyStream, {
		headers: {
			"content-type": "text/html",
			...(compression ? { "content-encoding": compression } : {}),
			"content-length": body.length.toString(),
			// "transfer-encoding": "gzip",
		},
	});
	console.log(response);
	return response;
}

function streamingResponse(request: Request): Response {
	const url = new URL(request.url);
	const compression = url.searchParams.get("compression") ?? "";
	const iterations = Number(url.searchParams.get("iterations") ?? 5);
	const pause = Number(url.searchParams.get("pause") ?? 200);
	const chunksize = Number(url.searchParams.get("chunksize") ?? 500);

	const stream = new ReadableStream({
		async start(controller) {
			controller.enqueue(
				`<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body><p><a href="/">Home</a></p>\n`
			);
			// need certain amount of data to start stream chunking
			let preamble = "";
			for (let i = 0; i < 100; i++) {
				const bytes = new Uint8Array(10);
				const chars = Array.from(crypto.getRandomValues(bytes))
					.map((n) => n.toString(36))
					.join("");
				preamble += `<!-- preamble ${i} ${chars} -->\n`;
			}
			controller.enqueue(preamble);
			controller.enqueue("<div>START</div>\n");

			for (let i = 0; i < iterations; i++) {
				await new Promise((r) => setTimeout(r, pause));
				console.log("writing chunk", i);
				const bytes = new Uint8Array(chunksize);
				const chars = Array.from(crypto.getRandomValues(bytes))
					.map((n) => n.toString(36))
					.join("");
				controller.enqueue(
					`<div>test ${i} (chunk size: ${chars.length})</div><!-- ${chars} -->\n`
				);
			}
			controller.enqueue("<div>END</div>\n");
			controller.enqueue(`</body></html>`);
			controller.close();
		},
	}).pipeThrough(new TextEncoderStream());

	return new Response(stream, {
		headers: {
			"content-type": "text/html",
			// Setting the content-encoding to gzip tells workerd to compress the response.
			// Setting it to identity means no compression.
			...(compression ? { "content-encoding": compression } : {}),
		},
	});
}

function ReadableStreamFromString(str: string): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			const chunk = encoder.encode(str);
			controller.enqueue(chunk);
			controller.close();
		},
	});
}
