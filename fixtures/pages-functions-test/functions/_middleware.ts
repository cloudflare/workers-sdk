export const onRequest = async (context) => {
	const response = await context.next();
	response.headers.set("X-Middleware", "active");
	return response;
};
