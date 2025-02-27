import { DurableObject } from "cloudflare:workers";

export class MyDurableObject extends DurableObject {
	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
	}
	async sayHello() {
		return "Hello, World from DO!";
	}
}

export default {
	async fetch() {
		//shoudln't get here
		return new Response("nope");
	},
};
