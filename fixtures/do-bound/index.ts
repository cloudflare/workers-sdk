import { DurableObject, RpcTarget } from "cloudflare:workers";

export class ThingObject extends DurableObject {
	fetch(request) {
		return new Response("hello world");
	}
	get property() {
		return "property:ping";
	}
	get prop1() {
		return new Deep1();
	}
	method() {
		return "method:ping";
	}
}

class Deep1 extends RpcTarget {
	get prop2() {
		return "deep:prop2";
	}
}

// class Deep2 extends RpcTarget {
// 	get prop3() {
// 		return "deep property";
// 	}
// }

export default {}; // Required to treat as modules format worker
