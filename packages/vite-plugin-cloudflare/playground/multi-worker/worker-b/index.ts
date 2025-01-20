import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	override fetch() {
		return Response.json({
			name: "Worker B",
		});
	}
	add(a: number, b: number) {
		return a + b;
	}
	get name() {
		return "Cloudflare";
	}
}

export class NamedEntrypoint extends WorkerEntrypoint {
	multiply(a: number, b: number) {
		return a * b;
	}
}
