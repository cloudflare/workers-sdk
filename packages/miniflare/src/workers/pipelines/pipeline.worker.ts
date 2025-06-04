import { WorkerEntrypoint } from "cloudflare:workers";

export default class Pipeline extends WorkerEntrypoint {
	async send(data: object[]): Promise<void> {
		console.log("Request received", data);
	}
}
