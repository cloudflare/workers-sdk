export default {
	fetch(request, env) {
		const marker = new URL(request.url).searchParams.get("marker");
		env.ANALYTICS_ENGINE.writeDataPoint({ blobs: [marker], indexes: [marker] });
		return new Response("Data point written to env.ANALYTICS_ENGINE");
	},
};
