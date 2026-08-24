export default {
	fetch() {
		return new Response(
			"Hello from a remote Worker part of the vitest-plugin remote bindings fixture!"
		);
	},
};
