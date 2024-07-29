export default {
	fetch(req, env) {
		return new Response(`Hello from module worker c (${env.MY_ENV})`);
	},
};
