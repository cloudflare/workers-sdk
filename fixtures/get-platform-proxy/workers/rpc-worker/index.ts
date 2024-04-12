import { WorkerEntrypoint } from "cloudflare:workers";

export default {
	async fetch(request: Request, env: Record<string, unknown>, ctx: unknown) {
		throw new Error(
			"Worker only used for RPC calls, there's no default fetch handler"
		);
	},
};

export class NamedEntrypoint extends WorkerEntrypoint {
	sum(args: number[]): number {
		return args.reduce((a, b) => a + b);
	}
	asJsonResponse(args: unknown): {
		status: number;
		text: () => Promise<string>;
	} {
		return Response.json(args);
	}
}
