export default {
	async fetch(request, env) {
		// Simulate acquiring a session
		const content = await env.BROWSER.fetch("http://fake.host/v1/acquire");
		return Response.json(await content.json());
	},
};
