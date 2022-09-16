export default {
	async fetch(req, env) {
		return await env.CHILD.fetch(req);
	},
};
