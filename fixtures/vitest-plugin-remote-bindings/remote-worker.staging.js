export default {
	fetch() {
		return new Response(
			"Hello from a remote Worker, defined for the staging environment, part of the vitest-plugin remote bindings fixture!"
		);
	},
};
