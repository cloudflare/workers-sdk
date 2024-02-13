export default {
	async fetch(): Promise<Response> {
		return new Response("Hello World from do-worker-a");
	},
};

export class DurableObjectClass {
	async fetch() {
		return new Response("Hello from DurableObject A");
	}
}
