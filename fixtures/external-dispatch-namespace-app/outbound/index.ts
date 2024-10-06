export default {
	fetch(request, env) {
		return new Response(JSON.stringify(Object.fromEntries([...request.headers.entries()])), {
			headers: { parameter1: env.parameter1, parameter2: env.parameter2 },
		});
	},
};
