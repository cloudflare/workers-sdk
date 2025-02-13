const fetch = require("cross-fetch");

export const onRequest = () => {
	const supportsDefaultExports = typeof fetch === "function";
	const supportsNamedExports = typeof fetch.Headers === "function";

	return new Response(
		supportsDefaultExports && supportsNamedExports ? "OK!" : "KO!",
	);
};
