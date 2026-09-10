export default {
	async fetch(request, env, ctx) {
		const results = {};
		try {
			const response = await env.VPC_NETWORK_UUID.fetch(
				"http://10.0.0.1:8080/"
			);
			results.VPC_NETWORK_UUID = await response.text();
		} catch (e) {
			const name = e.constructor?.name ?? "Error";
			results.VPC_NETWORK_UUID = `${name}: ${e.message}`;
		}
		return new Response(JSON.stringify(results));
	},
};
