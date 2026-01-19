export default {
	async fetch(request, env, ctx): Promise<Response> {
		console.log('Hello World!');
		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;
