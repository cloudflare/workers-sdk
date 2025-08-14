const worker: ExportedHandler = {
	fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname === "/python") {
			return Response.redirect(
				"https://workers.cloudflare.com/playground/python",
				302
			);
		} else {
			return Response.redirect(
				"https://workers.cloudflare.com/playground",
				302
			);
		}
	},
};

export default worker;
