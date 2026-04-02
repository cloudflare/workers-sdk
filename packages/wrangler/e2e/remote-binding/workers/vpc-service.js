export default {
	async fetch(request, env, ctx) {
		try {
			const response = await env.VPC_SERVICE.fetch("http://10.0.0.1:8080/");
			return new Response(await response.text());
		} catch (e) {
			const name = e.constructor?.name ?? "Error";
			return new Response(`${name}: ${e.message}`);
		}
	},
};
