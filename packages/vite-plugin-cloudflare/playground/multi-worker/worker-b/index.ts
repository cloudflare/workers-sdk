import { WorkerEntrypoint } from "cloudflare:workers";

interface Env {
	CONFIGURED_VAR?: string;
}

export default class extends WorkerEntrypoint<Env> {
	override fetch(request: Request) {
		const url = new URL(request.url);
		if (url.pathname === "/websocket") {
			const upgradeHeader = request.headers.get("Upgrade");
			if (upgradeHeader !== "websocket") {
				return new Response("Worker B expected Upgrade: websocket", {
					status: 426,
				});
			}

			const { 0: client, 1: server } = new WebSocketPair();
			server.accept();
			server.addEventListener("message", (event) => {
				server.send(`Worker B received: ${event.data}`);
			});

			return new Response(null, { status: 101, webSocket: client });
		}

		if (url.pathname === "/config-test") {
			return Response.json({
				configuredVar: this.env.CONFIGURED_VAR,
			});
		}
		return Response.json({
			name: "Worker B",
		});
	}
	add(a: number, b: number) {
		return a + b;
	}
	foo(emoji: string) {
		return {
			bar: {
				baz: () => `You made it! ${emoji}`,
			},
		};
	}
	get name() {
		return "Cloudflare";
	}
}

export class NamedEntrypoint extends WorkerEntrypoint {
	multiply(a: number, b: number) {
		return a * b;
	}

	baz(emoji: string) {
		return {
			bar: {
				foo: () => `You made it! ${emoji}`,
			},
		};
	}
}
