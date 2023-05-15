export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const redirectUrl = url.searchParams.get('redirectUrl'); // get a query param value (?redirectUrl=...)

		if (!redirectUrl) {
			return new Response('Bad request: Missing `redirectUrl` query param', { status: 400 });
		}

		// The Response class has static methods to create common Response objects as a convenience
		return Response.redirect(redirectUrl);
	},
};
