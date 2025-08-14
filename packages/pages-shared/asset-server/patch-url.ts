// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
globalThis.URL = (function (globalURL) {
	PatchedURL.prototype = globalURL.prototype;
	PatchedURL.createObjectURL = globalURL.createObjectURL;
	PatchedURL.revokeObjectURL = globalURL.revokeObjectURL;

	return PatchedURL as unknown as typeof globalURL;

	function PatchedURL(input: string, base?: string | URL) {
		const url = new globalURL(encodeURI(input), base);

		return new Proxy(url, {
			get(target, prop) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return globalThis.decodeURIComponent((target as any)[prop]);
			},
		});
	}
})(URL);

export {};
