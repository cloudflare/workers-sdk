import { WorkerEntrypoint } from "cloudflare:workers";

export class TestEntrypoint extends WorkerEntrypoint {
	ping() {
		return "pong";
	}
}

export default {
	fetch(request, env) {
		return env.remote.fetch(request);
	},
} satisfies ExportedHandler<{ remote: any }>;
