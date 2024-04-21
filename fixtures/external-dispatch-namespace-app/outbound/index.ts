export default {
	fetch(request, env) {
		return new Response("intercepted", {
			headers: { parameter1: env.parameter1, parameter2: env.parameter2 },
		});
	},
};
