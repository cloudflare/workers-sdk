import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";
import { CloudflareBindings } from "../worker-configuration";

const app = new Hono<{ Bindings: CloudflareBindings }>();
app.use("*", cors());

type UserData = {
	cloudchamber: {
		ip: string;
		host: string;
	};
	id: string;
};

export async function startAndWaitForPort(
	container: Container,
	portToAwait,
	maxTries = 10
) {
	const port = container.getTcpPort(portToAwait);
	// promise to make sure the container does not exit
	let monitor;

	for (let i = 0; i < maxTries; i++) {
		try {
			if (!container.running) {
				container.start({ enableInternet: true });

				// force DO to keep track of running state
				monitor = container.monitor();
			}

			await (await port.fetch("http://ping")).text();
			return;
		} catch (err) {
			console.error("Error connecting to the container on", i, "try", err);

			if (err.message.includes("listening")) {
				await new Promise((res) => setTimeout(res, 300));
				continue;
			}

			// no container yet
			if (
				err.message.includes(
					"there is no container instance that can be provided"
				)
			) {
				await new Promise((res) => setTimeout(res, 300));
				continue;
			}

			throw err;
		}
	}

	throw new Error(
		`could not check container healthiness after ${maxTries} tries`
	);
}

export async function proxyFetch(container, request, portNumber) {
	return await container
		.getTcpPort(portNumber)
		.fetch(request.url.replace("https://", "http://"), request.clone());
}

function switchRemote(url: URL, remote: string) {
	const workerUrl = new URL(url);
	const remoteUrl = new URL(remote);
	workerUrl.hostname = remoteUrl.hostname;
	workerUrl.protocol = remoteUrl.protocol;
	workerUrl.port = remoteUrl.port;
	return workerUrl;
}

export class CloudchamberController extends DurableObject<CloudflareBindings> {
	constructor(ctx, env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			await startAndWaitForPort(ctx.container, 3125);
		});
	}
	async setAlarm(value = Date.now() + 5000) {
		const alarm = await this.ctx.storage.getAlarm();
		if (alarm === null) {
			await this.ctx.storage.setAlarm(value);
			await this.ctx.storage.sync();
		}
	}
	async alarm() {
		await this.setAlarm();
	}

	sessionId: string | undefined;

	// dummy method to make sure the constructor is called
	async create(sessionId: string): Promise<void> {
		this.sessionId = sessionId;
	}

	async fetch(request: Request) {
		console.log("container do");

		// return await proxyFetch(this.ctx.container, request, 3125);
		const url = new URL(request.url);
		if (url.pathname == "/proxy") {
			const original = await proxyFetch(
				this.ctx.container,
				new Request(
					"http://container" + url.searchParams.get("suffix"),
					request
				),
				url.searchParams.get("port")
			);
			const embeddable = new Response(original.body, original);
			// This will be embedded in an iframe. In particular, the Cloudflare error page sets this header.
			embeddable.headers.delete("X-Frame-Options");
			return embeddable;
		}
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);
		server.accept();
		console.log("container do ws accepted");

		if (url.pathname.startsWith("/terminal")) {
			console.log("container terminal");

			const vm = await this.ctx.container.getTcpPort(3125).fetch(
				new Request("http://container/terminal?cols=80&rows=80", {
					headers: { Upgrade: "websocket" },
				})
			);
			if (vm.webSocket === null) throw new Error("websocket server is faulty");
			vm.webSocket.accept();
			console.log("terminal ws", url, vm);

			// const res = await this.container.getTcpPort(8080).fetch(
			// 	new Request("http://container/ws", {
			// 		headers: { Upgrade: "websocket" },
			// 	})
			// );
			// if (res.webSocket === null) throw new Error("websocket server is faulty");

			// // Accept the websocket and listen to messages
			// res.webSocket.accept();
			// res.webSocket.addEventListener("message", (msg) => {
			// 	if (this.resolveResolve !== undefined)
			// 		this.resolveResolve(
			// 			typeof msg.data === "string"
			// 				? msg.data
			// 				: new TextDecoder().decode(msg.data)
			// 		);
			// });

			// res.webSocket.addEventListener("close", () => {
			// 	this.ctx.abort();
			// });

			// this.conn = res.webSocket;
			server.addEventListener("message", (event) => {
				console.log("server -> vm message");
				vm.webSocket?.send(event.data);
			});

			vm.webSocket.addEventListener("message", (event) => {
				console.log(
					"vm -> client message",
					new TextDecoder().decode(event.data)
				);

				server.send(event.data);
			});

			server.addEventListener("close", (cls) => {
				console.log("server close", cls.code);

				vm.webSocket?.close();
			});

			vm.webSocket.addEventListener("close", (cls) => {
				console.log("vm close", cls.code);

				server.close();
			});
		} else if (url.pathname.startsWith("/fs")) {
			console.log("container fs");

			const vm = await this.ctx.container.getTcpPort(3125).fetch(
				new Request("http://container/fs", {
					headers: { Upgrade: "websocket" },
				})
			);
			if (vm.webSocket === null) throw new Error("websocket server is faulty");
			vm.webSocket.accept();
			server.addEventListener("message", (event) => {
				vm.webSocket?.send(event.data);
			});

			vm.webSocket.addEventListener("message", (event) => {
				client.send(event.data);
			});

			server.addEventListener("close", (cls) => {
				vm.webSocket?.close();
			});
		} else {
			return this.ctx.container
				.getTcpPort(3125)
				.fetch(`http://container${url.pathname}`, request);
		}

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		console.log("fetch trigger");
		if (request.method === "POST" && url.pathname === "/editor/setup") {
			console.log("editor setup");

			const sessionId = crypto.randomUUID();
			let id = env.CLOUDCHAMBER_CONTROLLER.idFromName(sessionId);

			let controller = env.CLOUDCHAMBER_CONTROLLER.get(id);

			await controller.create(sessionId);

			const token = await sign({ sessionId }, env.JWT_SECRET, "HS256");

			return Response.json({ token });
		} else {
			try {
				console.log("catchall");

				// const token = request.headers.get("X-Session-Token") ?? "";
				const token = url.searchParams.get("token")!;
				console.log("catchall", token);

				const verified = await verify(token, env.JWT_SECRET, "HS256");
				console.log("catchall", verified);

				let id = env.CLOUDCHAMBER_CONTROLLER.idFromName(verified.sessionId);
				let controller = env.CLOUDCHAMBER_CONTROLLER.get(id);

				return controller.fetch(request);
			} catch (e) {
				console.error("error thrown", e);
				return new Response("Error");
			}
		}
	},
} satisfies ExportedHandler<CloudflareBindings>;
