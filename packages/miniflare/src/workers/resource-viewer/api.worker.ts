// Resource Viewer API Worker
// Provides a REST API for viewing and manipulating user resources

import { WorkerEntrypoint } from "cloudflare:workers";

export default class ResourceViewerAPI extends WorkerEntrypoint {
	async fetch(): Promise<Response> {
		return new Response("Hello from Resource Viewer API");
	}
}
