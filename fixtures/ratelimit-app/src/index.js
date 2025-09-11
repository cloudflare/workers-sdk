console.log("startup log");

export default {
	async fetch(request, env) {
		console.log("request log");

		const { pathname } = new URL(request.url);

		if (pathname.startsWith("/unsafe")) {
			const { success } = await env.UNSAFE_RATE_LIMITER.limit({
				key: pathname,
			});
			if (!success) {
				return new Response("unsafe: Slow down", { status: 429 });
			}
			return new Response("unsafe: Success");
		}
		const { success } = await env.RATE_LIMITER.limit({ key: pathname });
		if (!success) {
			return new Response(`Slow down`, {
				status: 429,
			});
		}

		return new Response("Success");
	},
};
