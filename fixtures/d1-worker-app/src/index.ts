export default {
	async fetch(request, env) {
		return Response.json(env);
	},
};
export class DurableObjectExample {
	constructor(state, env) {}

	async fetch(request) {
		return new Response("Hello World");
	}
}
