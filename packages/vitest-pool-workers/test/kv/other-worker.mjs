export class OtherObject {
	async fetch(request) {
		return new Response("other Durable Object body");
	}
}

export default {
	async fetch(request, env, ctx) {
		return new Response("other body");
	},
};
