// local explorer API Worker
// Provides a REST API for viewing and manipulating user resources

import { WorkerEntrypoint } from "cloudflare:workers";

export default class LocalExplorerAPI extends WorkerEntrypoint {
	async fetch(): Promise<Response> {
		return new Response("Hello from local explorer API");
	}
}
