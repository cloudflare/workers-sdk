export default {
	fetch(req, env) {
		return new Response(`Hello from module worker d (${env.MY_ENV})`);
	},
};
