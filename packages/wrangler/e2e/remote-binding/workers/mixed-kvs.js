export default {
	async fetch(request, env) {
		return new Response(
			`The kv local value is: ${await env.KV_LOCAL_BINDING.get("test-key")}\n` +
				`The kv remote value is ${await env.KV_REMOTE_BINDING.get("test-key")}`
		);
	},
};
