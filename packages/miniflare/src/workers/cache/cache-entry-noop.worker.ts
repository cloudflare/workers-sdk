import { CacheHeaders } from "./constants";

export async function miss(request: Request): Promise<Response> {
	if (request.method === "GET") {
		return new Response(null, {
			status: 504,
			headers: { [CacheHeaders.STATUS]: "MISS" },
		});
	} else if (request.method === "PUT") {
		// Must consume request body, otherwise get "disconnected: read end of pipe was aborted" error from workerd
		await request.body?.pipeTo(new WritableStream());
		return new Response(null, { status: 204 });
	} else if (request.method === "PURGE") {
		return new Response(null, { status: 404 });
	} else {
		return new Response(null, { status: 405 });
	}
}

export default <ExportedHandler>{ fetch: miss };
