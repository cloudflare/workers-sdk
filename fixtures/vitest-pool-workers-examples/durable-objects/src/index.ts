import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject {
	count: number = 0;
	#webSocketMessages: string[] = [];

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		void ctx.blockConcurrencyWhile(async () => {
			this.count = (await ctx.storage.get("count")) ?? 0;
		});
	}

	increment(by = 1) {
		this.count += by;
		void this.ctx.storage.put("count", this.count);
	}

	fetch(request: Request) {
		const url = new URL(request.url);
		if (url.pathname === "/websocket-order") {
			const { 0: client, 1: server } = new WebSocketPair();
			this.ctx.acceptWebSocket(server);
			return new Response(null, { status: 101, webSocket: client });
		}
		if (url.pathname === "/websocket-order-log") {
			return Response.json(this.#webSocketMessages);
		}
		if (url.pathname === "/redirect") {
			return Response.redirect("https://example.com/redirected", 302);
		}
		this.increment();
		return new Response(this.count.toString());
	}

	alarm() {
		this.count = 0;
		void this.ctx.storage.put("count", this.count);
	}

	scheduleReset(afterMillis: number) {
		void this.ctx.storage.setAlarm(Date.now() + afterMillis);
	}

	webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const value =
			typeof message === "string" ? message : new TextDecoder().decode(message);
		this.#webSocketMessages.push(value);
		ws.send(value);
	}

	webSocketClose() {}

	webSocketError() {}
}

export class SQLiteDurableObject extends DurableObject {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}
	fetch() {
		return new Response(this.ctx.storage.sql.databaseSize.toString());
	}
}

export default <ExportedHandler<Env>>{
	fetch(request, env) {
		const { pathname } = new URL(request.url);
		if (pathname === "/sql") {
			const id = env.SQL.idFromName(pathname);
			const stub = env.SQL.get(id);
			return stub.fetch(request);
		}
		const id = env.COUNTER.idFromName(pathname);
		const stub = env.COUNTER.get(id);
		return stub.fetch(request);
	},
};
