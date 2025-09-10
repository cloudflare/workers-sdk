export default {
	async fetch(request, env) {
		const response = new Response("Hello");

		const customMessage = request.headers.get("x-custom-message");
		if (customMessage) {
			if (customMessage === "%__VERY_VERY_LONG_MESSAGE_%") {
				// We can't simply pass a huge long message as a header thus
				// why a placeholder is used here
				console.log("<<<<< " + "z".repeat(2 ** 20) + " >>>>>");
			} else {
				console.log("<<<<< " + customMessage + " >>>>>");
			}
			return response;
		}

		console.log("<<<<< console.log() message >>>>>");
		console.warn("<<<<< console.warning() message >>>>>");
		console.error("<<<<< console.error() message >>>>>");
		console.debug("<<<<< console.debug() message >>>>>");
		console.info("<<<<< console.info() message >>>>>");

		process.stderr.write("<<<<< stderr.write() message >>>>>\n");
		process.stdout.write("<<<<< stdout.write() message >>>>>\n");

		return response;
	},
};
