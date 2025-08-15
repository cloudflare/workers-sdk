export default {
	async fetch(request, env) {
		let log = {
			url: request.url,
			method: request.method,
			headers: Object.fromEntries(request.headers),
		};
		await env.PIPELINE.send([log]);
		return new Response("Data sent to env.PIPELINE");
	},
};
