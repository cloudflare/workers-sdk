import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	override fetch() {
		return Response.json({
			name: "Worker D (no config file)",
		});
	}

	multiply(a: number, b: number) {
		return a * b;
	}
}
