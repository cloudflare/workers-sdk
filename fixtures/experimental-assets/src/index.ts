import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint{
	fetch(request: Request) {
		return new Response("Hello world!");
	}
}