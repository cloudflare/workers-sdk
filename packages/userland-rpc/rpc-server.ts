import { DurableObject } from "cloudflare:workers";
import { RpcServer } from ".";

export class RpcDurableObject extends DurableObject<Record<string, unknown>> {
	rpc: RpcServer | undefined = undefined;
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const key = url.pathname.slice(1);
		console.log("server request", key);

		if (!request.headers.get("Upgrade")?.includes("websocket")) {
			return new Response("hello");
		}

		const [server, client] = Object.values(new WebSocketPair());

		this.rpc = new RpcServer((d) => {
			console.log("server -> client");

			server.send(d);
		}, this.env[key]);

		server.addEventListener("message", (event) => {
			console.log("client -> server received");

			this.rpc?.receive(event.data as string);
		});
		server.accept();

		return new Response(null, { status: 101, webSocket: client });
	}
}

export default {
	fetch(request, env) {
		const id = env.DO.idFromName(request.url);
		return env.DO.get(id).fetch(request);
	},
} satisfies ExportedHandler<{ DO: DurableObjectNamespace }>;
