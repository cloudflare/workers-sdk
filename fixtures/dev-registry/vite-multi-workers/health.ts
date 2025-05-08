import { WorkerEntrypoint } from "cloudflare:workers";

export default class HealthEntrypoint extends WorkerEntrypoint {
	ping() {
		return "Pong";
	}
}
