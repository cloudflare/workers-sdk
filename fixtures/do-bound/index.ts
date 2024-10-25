import { DurableObject } from "cloudflare:workers";

export class ThingObject extends DurableObject {
	fetch(request) {
		return new Response("hello world");
	}
	get property() {
		return "property:ping";
	}
	method() {
		return "method:ping";
	}
}

export default {}; // Required to treat as modules format worker
