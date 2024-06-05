export default {
	async fetch(request) {
		return new Response(`${request.url} ${new Date()}`);
	},
};
