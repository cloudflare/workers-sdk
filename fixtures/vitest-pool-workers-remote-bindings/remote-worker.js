export default {
	fetch() {
		return new Response(
			"Hello from a remote worker part of the vitest-pool-workers remote bindings fixture!"
		);
	},
};
