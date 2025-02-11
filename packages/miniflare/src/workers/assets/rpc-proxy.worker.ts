import { WorkerEntrypoint } from "cloudflare:workers";

export default class SpecialDefault extends WorkerEntrypoint {
	fetch(request) {
		return this.env.ROUTER_WORKER.fetch(request);
	}

	constructor(...args) {
		return new Proxy(super(...args), {
			get(target, prop, receiver) {
				// totally shit
				if (prop === "fetch") {
					const originalFetch = target[prop];
					return function (...args) {
						return originalFetch.apply(target, args);
					};
				}

				if (prop === "env") {
					return Reflect.get(target, prop, receiver);
				}

				if (target[prop] !== undefined) {
					return target[prop];
				}

				return function (...args) {
					return receiver.env.USER_WORKER[prop](...args);
				};
			},
		});
	}
}
