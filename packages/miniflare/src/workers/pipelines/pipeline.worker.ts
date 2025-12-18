import { WorkerEntrypoint } from "cloudflare:workers";

export default class Pipeline extends WorkerEntrypoint {
	async send(_data: object[]): Promise<void> {}
}
