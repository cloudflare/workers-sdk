export default {
	async fetch() {
		return new Response("Hello World!");
	},
};

export class MyWorkflow {
	async run() {
		return "workflow result";
	}
}
