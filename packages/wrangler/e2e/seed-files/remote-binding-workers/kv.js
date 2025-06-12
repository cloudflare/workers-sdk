export default {
	async fetch(request, env) {
		return new Response(
			`The pre-existing value is: ${await env.KV_BINDING.get("test-mixed-mode-key")}`
		);
	},
};
