export default (<ExportedHandler>{
	async fetch(request, env, ctx) {
		return new Response("👋");
	},
	async scheduled(controller, env, ctx) {
		// ...
	},
});
