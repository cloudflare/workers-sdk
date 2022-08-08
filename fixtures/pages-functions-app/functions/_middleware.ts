export const onRequest = async ({ next }) => {
	const response = await next();
	response.headers.set("x-custom", "header value");
	return response;
};
