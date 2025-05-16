export default {
	async fetch(request, env) {
		const messages = [
			{
				role: "user",
				// Doing snapshot testing against AI responses can be flaky, but this prompt generates the same output relatively reliably
				content:
					"Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
			},
		];

		const content = await env.AI.run("@hf/thebloke/zephyr-7b-beta-awq", {
			messages,
		});

		return new Response(content.response);
	},
};
