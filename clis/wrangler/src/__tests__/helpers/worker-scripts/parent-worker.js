export default {
	async fetch(req, env) {
		const resp = await env.CHILD.fetch(req);
		const text = await resp.text();
		// TODO: we should capture console logs when running `dev` programmatically
		// (and locally) and expose it on the DevWorker object instead of allowing
		// the log to appear in the output of the test runner.
		// console.log("text: ", text);
		return new Response(`Parent worker sees: ${text}`);
	},
};
