import { DurableObject } from "cloudflare:workers";

export class TestObject extends DurableObject {
	ping() {
		return "Pong";
	}

	fetch(request: Request) {
		return new Response("Hello from Durable Object!");
	}
}

export default {
	fetch() {
		return new Response(`I'm a teapot`, { status: 418 });
	},
};
