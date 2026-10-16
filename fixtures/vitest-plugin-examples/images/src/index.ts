export default {
	async fetch(request, env, _ctx) {
		return Response.json(await env.IMAGES.info(request.body!));
	},
} satisfies ExportedHandler<Env>;
// ^ Using `satisfies` provides type checking/completions for `ExportedHandler`
//   whilst still allowing us to call `worker.fetch()` and `worker.queue()` in
//   tests without asserting they're defined.
