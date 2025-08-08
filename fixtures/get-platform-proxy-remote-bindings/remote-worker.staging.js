export default {
	fetch() {
		return new Response(
			"Hello from a remote Worker, defined for the staging environment, part of the getPlatformProxy remote bindings fixture!"
		);
	},
};
