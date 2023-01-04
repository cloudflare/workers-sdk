/*
  Using this template:
  In wrangler.toml
    * Edit the worker name.
    * Edit the "dataset" field in the analytics_engine binding to specify the name of the Workers Analytics Engine dataset to write to.
  In a terminal
    * Run "wrangler secret put BEARER_TOKEN" and enter a secret value. You must also supply this token when calling the worker (see README.md).
  In this file:
    * Edit the "writeDataPoint" call in the "processLogEntry" function to map your event data to fields in the analytics engine data point.
    * Optionally you could add additional code in that function to filter or process your messages before logging them.
*/

// processLogEntry maps incoming log/event lines onto an Analytics Engine datapoint and writes the datapoint to Analytics Engine.
// As an example we've shown a mapping of the Cloudflare default HTTP requests log fields.
// Textual fields are mapped to blobs and numeric fields to doubles.
// Edit this to map the fields that are present in your data.
function processLogEntry(ANALYTICS, data) {
	ANALYTICS.writeDataPoint({
		indexes: [data.ClientRequestHost || ''], // Supply one index
		blobs: [
			// Supply a maximum of 20 blobs (max total data size 5120 bytes)
			data.RayID || '',
			data.ClientIP || '',
			data.ClientRequestMethod || '',
			data.ClientRequestURI || '',
		],
		doubles: [
			// Supply a maximum of 20 doubles
			data.EdgeStartTimestamp || 0,
			data.EdgeEndTimestamp || 0,
			data.EdgeResponseStatus || 0,
			data.EdgeResponseBytes || 0,
		],
	});
}

// ///////////////////////////////////////////////////////

const MAX_ANALYTICS_CALLS = 25;

export default {
	async fetch(request, env) {
		// Check authz
		if (!isAuthd(request, env)) {
			return makeResponse('Not authorized.', 403);
		}

		// Decode the body and split it into lines
		var lines;
		try {
			const compressed = request.headers.get('Content-Encoding') == 'gzip';
			lines = readStream(request.body, compressed);
		} catch (e) {
			return makeResponse('Unable to decode input.', 400);
		}

		// Parse each line and write the data to Analytics Engine
		var dataPointsWritten = 0;
		for await (const line of lines) {
			if (dataPointsWritten >= MAX_ANALYTICS_CALLS) {
				return makeResponse(`At most ${MAX_ANALYTICS_CALLS} log lines can be supplied.`, 400);
			}

			var data;
			try {
				data = JSON.parse(line);
			} catch (e) {
				return makeResponse('Unable to parse JSON.', 400);
			}
			processLogEntry(env.ANALYTICS, data);
			dataPointsWritten++;
		}

		return makeResponse('Success', 200);
	},
};

// isAuthd checks that the user has supplied an appropriate bearer token in the Authorization header.
function isAuthd(request, env) {
	const authz = request.headers.get('Authorization');
	const secret = env.BEARER_TOKEN;
	if (secret === undefined || authz === null) {
		return false;
	}
	const want = `Bearer ${secret}`;

	const enc = new TextEncoder();
	const authzBuffer = enc.encode(authz);
	const wantBuffer = enc.encode(want);
	if (authzBuffer.length != wantBuffer.length) {
		return false;
	}
	return crypto.subtle.timingSafeEqual(authzBuffer, wantBuffer);
}

// readStream decompresses the incoming stream if needed then slices the stream into lines separated by \n
async function* readStream(body, compressed) {
	// Decompress the strem if needed
	var uncompressedStream;
	if (compressed) {
		const ds = new DecompressionStream('gzip');
		uncompressedStream = body.pipeThrough(ds);
	} else {
		uncompressedStream = body;
	}

	// Split the stream into an array of lines
	const reader = uncompressedStream.getReader();
	var remainder = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			if (remainder != '') {
				yield remainder;
			}
			break;
		}
		const stringData = new TextDecoder().decode(value);
		const chunks = stringData.split('\n');
		if (chunks.length > 1) {
			chunks[0] = remainder + chunks[0];
			remainder = '';
		}
		if (chunks.length > 0) {
			remainder = chunks.pop();
		}
		yield* chunks;
	}
}

// makeResponse builds a JSON response with the supplied status code.
function makeResponse(text, code) {
	return new Response(
		JSON.stringify({
			message: text,
		}),
		{
			status: code,
			headers: { 'content-type': 'application/json' },
		}
	);
}
