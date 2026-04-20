export const onRequest: PagesFunction = async (context) => {
	const response = await context.next();
	const newResponse = new Response(response.body, response);
	newResponse.headers.set("X-Middleware", "active");
	return newResponse;
};
