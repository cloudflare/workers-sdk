import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	async hello() {
		return "Hello World from Worker B!";
	}
}
