export default {
	async fetch(request, env, ctx) {
		const results = {};
		for (const key of ["VPC_NETWORK_TUNNEL", "VPC_NETWORK_MESH"]) {
			try {
				const response = await env[key].fetch("http://10.0.0.1:8080/");
				results[key] = await response.text();
			} catch (e) {
				const name = e.constructor?.name ?? "Error";
				results[key] = `${name}: ${e.message}`;
			}
		}
		return new Response(JSON.stringify(results));
	},
};
