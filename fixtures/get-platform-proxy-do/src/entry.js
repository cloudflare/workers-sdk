export * from "worker.js";

export default {
	fetch() {
		return new Response("no-op");
	},
};
