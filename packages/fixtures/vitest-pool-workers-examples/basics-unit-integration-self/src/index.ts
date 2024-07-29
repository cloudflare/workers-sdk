export function greet(request: Request): string {
	return `👋 ${request.url}`;
}

export default {
	async fetch(request, env, ctx) {
		return new Response(greet(request));
	},
	async scheduled(controller, env, ctx) {
		// ...
	},
} satisfies ExportedHandler;
// ^ Using `satisfies` provides type checking/completions for `ExportedHandler`
//   whilst still allowing us to call `worker.fetch()` in tests without
//   asserting `worker.fetch` is defined.
