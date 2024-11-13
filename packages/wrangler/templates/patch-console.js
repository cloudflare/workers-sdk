globalThis.console = new Proxy(globalThis.console, {
	get(target, p, receiver) {
		if (p === "log" || p === "debug" || p === "info") {
			return (...args) =>
				Reflect.get(target, p, receiver)(WRANGLER_WORKER_NAME, ...args);
		}
		return Reflect.get(target, p, receiver);
	},
});
