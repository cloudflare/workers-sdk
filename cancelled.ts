export default {
	async fetch(req) {
		// await new Promise((r) => setTimeout(r, 5000));
		// const err = new Error("blah");
		// console.log(
		// 	JSON.stringify({ name: err.name, message: err.message, stack: err.stack })
		// );
		// throw err;

		return new Response("hello");
	},
};
