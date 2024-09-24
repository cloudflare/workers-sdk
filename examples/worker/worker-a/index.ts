export default {
	async fetch(request, env, ctx) {
		const count = (await env.MY_KV.get('KEY')) ?? '0';
		await env.MY_KV.put('KEY', `${Number(count) + 1}`);

		return new Response(`This is Worker A. The count is ${count}.`);
	},
} satisfies ExportedHandler<Env>;
