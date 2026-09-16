// Keep the destination fixed to prevent this Worker from becoming an open redirect.
const REDIRECT_URL = 'https://example.com/';

export default {
	async fetch(request, env, ctx) {
		// The Response class has static methods to create common Response objects as a convenience
		return Response.redirect(REDIRECT_URL);
	},
};
