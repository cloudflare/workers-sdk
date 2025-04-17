import { DurableObject } from "cloudflare:workers";
import { RpcServer } from ".";

export class RpcDurableObject extends DurableObject<Record<string, unknown>> {
	private rpc: RpcServer | undefined = undefined;
	constructor(state: DurableObjectState, env: Record<string, unknown>) {
		super(state, env);
	}
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const key = url.pathname.slice(1);
		console.log("server <- client");

		this.rpc ??= new RpcServer(this.env[key]);

		const response = await this.rpc.request(request);
		console.log("server -> client");

		return response;
	}
}

export default {
	fetch(request, env) {
		const id = env.DO.idFromName(request.url);
		return env.DO.get(id).fetch(request);
	},
} satisfies ExportedHandler<{ DO: DurableObjectNamespace }>;
