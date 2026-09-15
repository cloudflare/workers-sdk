import { DurableObject } from "cloudflare:workers";
export class OtherObject extends DurableObject {
	async fetch(request) {
		return new Response("OtherObject body");
	}
}

export default {
	fetch() {
		return new Response("hi");
	},
};
