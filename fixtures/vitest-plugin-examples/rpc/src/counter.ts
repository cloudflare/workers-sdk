import { RpcTarget } from "cloudflare:workers";

export class Counter extends RpcTarget {
	#value: number;

	constructor(value: number) {
		super();
		this.#value = value;
	}

	get value() {
		return this.#value;
	}

	increment(by = 1) {
		return (this.#value += by);
	}

	clone() {
		return new Counter(this.#value);
	}

	asObject() {
		return { val: this.#value };
	}
}
