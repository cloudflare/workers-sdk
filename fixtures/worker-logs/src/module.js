export default {
	async fetch(request, env) {
		const response = new Response("Hello");

		const customMessage = request.headers.get("x-custom-message");
		if (customMessage) {
			if (customMessage === "%__VERY_VERY_LONG_MESSAGE_%") {
				// We can't simply pass a huge long message as a header thus
				// why a placeholder is used here
				console.log("z".repeat(2 ** 20));
			} else {
				console.log(customMessage);
			}
			return response;
		}

		console.log("<<<<<this is a log>>>>>");
		console.warn("<<<<<this is a warning>>>>>");
		console.error("<<<<<this is an error>>>>>");
		console.debug("<<<<<this is a debug message>>>>>");
		console.info("<<<<<this is an info message>>>>>");

		return response;
	},
};
