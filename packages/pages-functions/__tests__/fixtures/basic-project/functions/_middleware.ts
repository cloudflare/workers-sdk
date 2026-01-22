export const onRequest = async (context: { next: () => Promise<Response> }) => {
	const response = await context.next();
	response.headers.set("X-Middleware", "true");
	return response;
};
