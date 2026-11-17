interface Env {
	BUCKET: R2Bucket;
}

/** Bridges HTTP bodies with known lengths to the remote R2 binding. */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const key = url.searchParams.get("key");
		if (key === null) {
			return new Response("Missing key", { status: 400 });
		}
		try {
			if (request.method === "GET") {
				const object = await env.BUCKET.get(key);
				if (object === null) {
					return new Response(null, { status: 404 });
				}
				return new Response(object.body, {
					headers: {
						"Content-Length": String(object.size),
						"Wrangler-R2-Object-Size": String(object.size),
						ETag: object.etag,
					},
				});
			}
			const uploadId = url.searchParams.get("uploadId");
			if (request.method === "POST" && uploadId === null) {
				const options = await request.json<
					Omit<R2MultipartOptions, "httpMetadata"> & {
						httpMetadata?: R2HTTPMetadata;
					}
				>();
				// Dates cross this HTTP boundary as strings.
				if (options.httpMetadata?.cacheExpiry !== undefined) {
					options.httpMetadata.cacheExpiry = new Date(
						options.httpMetadata.cacheExpiry
					);
				}
				const upload = await env.BUCKET.createMultipartUpload(key, options);
				return Response.json({ uploadId: upload.uploadId });
			}
			if (uploadId === null) {
				return new Response("Missing upload ID", { status: 400 });
			}
			const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
			if (request.method === "PUT" && request.body !== null) {
				return Response.json(
					await upload.uploadPart(
						Number(url.searchParams.get("partNumber")),
						request.body
					)
				);
			}
			if (request.method === "POST") {
				const parts = await request.json<R2UploadedPart[]>();
				const object = await upload.complete(parts);
				return Response.json({ size: object.size, etag: object.etag });
			}
			if (request.method === "DELETE") {
				await upload.abort();
				return new Response(null, { status: 204 });
			}
			return new Response(null, { status: 405 });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const code = Number(/\((\d+)\)$/.exec(message)?.[1]);
			const status =
				code === 10058 ? 429 : [10001, 10043, 10054].includes(code) ? 503 : 400;
			return Response.json({ message }, { status });
		}
	},
} satisfies ExportedHandler<Env>;
