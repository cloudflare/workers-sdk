export default {
	fetch() {
		return new Response(
			"Hello from a remote Worker part of the getPlatformProxy remote bindings fixture!"
		);
	},
};
