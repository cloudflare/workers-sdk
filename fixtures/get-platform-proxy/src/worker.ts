import { DurableObject } from "cloudflare:workers";
import { EnvWithDO } from "../worker-configuration";

export class MyDurableObject extends DurableObject {
	constructor(state: DurableObjectState, env: EnvWithDO) {
		super(state, env);
	}
	async sayHello(msg: string) {
		return "Hello, World from DO!" + " " + msg;
	}
}

export default {
	async fetch() {
		//shoudln't get here
		return new Response("nope");
	},
};
