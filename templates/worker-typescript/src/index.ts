export default {
	async fetch(request: Request) {
		return new Response(`request method: ${request.method}`);
	},
};
