export default {
	async fetch(request, env) {
		return new Response(
			`The pre-existing value is: ${await (await env.R2_BINDING.get("test-mixed-mode-key")).text()}`
		);
	},
};
