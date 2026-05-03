(globalThis as unknown as Record<string, unknown>).URL = (function (globalURL) {
	PatchedURL.prototype = globalURL.prototype;
	PatchedURL.createObjectURL = globalURL.createObjectURL;
	PatchedURL.revokeObjectURL = globalURL.revokeObjectURL;

	return PatchedURL as unknown as typeof globalURL;

	function PatchedURL(input: string, base?: string | URL) {
		const url = new globalURL(encodeURI(input), base);

		return new Proxy(url, {
			get(target, prop) {
				return globalThis.decodeURIComponent(
					(target as unknown as Record<string | symbol, string>)[prop]
				);
			},
		});
	}
})(URL);

export {};
