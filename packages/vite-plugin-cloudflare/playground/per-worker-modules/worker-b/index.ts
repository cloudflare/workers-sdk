import { WorkerEntrypoint } from "cloudflare:workers/worker-b";
import { greet } from "../shared/greet";

export default class extends WorkerEntrypoint {
	override fetch() {
		return new Response(greet(this.env));
	}
}
