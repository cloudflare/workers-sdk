import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";

export default {
	async fetch(request: Request, env: Record<string, unknown>, ctx: unknown) {
		throw new Error(
			"Worker only used for RPC calls, there's no default fetch handler"
		);
	},
};

export class NamedEntrypoint extends WorkerEntrypoint {
	sum(args: number[]): number {
		return args.reduce((a, b) => a + b);
	}

	sumObj(args: number[]): { isObject: true; value: number } {
		return {
			isObject: true,
			value: args.reduce((a, b) => a + b),
		};
	}

	asJsonResponse(args: unknown): {
		status: number;
		text: () => Promise<string>;
	} {
		return Response.json(args);
	}
	getCounter() {
		return new Counter();
	}

	getHelloWorldFn() {
		return () => "Hello World!";
	}

	getHelloFn() {
		return (
			greet: string,
			name: string,
			{
				suffix,
				capitalize,
			}: {
				suffix?: string;
				capitalize?: boolean;
			} = {}
		) => {
			const result = `${greet} ${name}${suffix ?? ""}`;
			if (capitalize) {
				return result.toUpperCase();
			}
			return result;
		};
	}
}

class Counter extends RpcTarget {
	#value = 0;

	increment(amount: number) {
		this.#value += amount;
		return this.#value;
	}

	get value() {
		return this.#value;
	}
}
