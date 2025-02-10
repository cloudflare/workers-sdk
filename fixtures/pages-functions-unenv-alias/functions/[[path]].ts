import * as dep from "../functions-deps/dep.cjs";

export const onRequest = () => {
	const supportsDefaultExports = typeof dep.default === "function" && dep.default() === "OK!";
	const supportsNamedExports = typeof dep.fetch === "function" && typeof dep.fetch.Headers === "function" && typeof dep.env === "function";

	return new Response(
		supportsDefaultExports && supportsNamedExports ? "OK!" : "KO!",
	);
};
