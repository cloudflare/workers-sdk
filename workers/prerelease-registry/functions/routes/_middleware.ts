export const onRequestOptions: PagesFunction = async () => {
	return new Response(null, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "*",
			"Access-Control-Allow-Methods": "GET,OPTIONS",
			"Access-Control-Max-Age": "86400",
		},
	});
};

export const onRequest: PagesFunction = async ({ next }) => {
	const response = await next();
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Headers", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
	response.headers.set("Access-Control-Max-Age", "86400");
	return response;
};
