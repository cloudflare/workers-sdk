function stripCfConnectingIPHeader(input, init) {
	const request = new Request(input, init);
	request.headers.delete("CF-Connecting-IP");
	return request;
}

globalThis.fetch = new Proxy(globalThis.fetch, {
	apply(target, thisArg, argArray) {
		return Reflect.apply(target, thisArg, [
			stripCfConnectingIPHeader.apply(null, argArray),
		]);
	},
});
