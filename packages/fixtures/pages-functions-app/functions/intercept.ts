export const onRequest: PagesFunction = async ({ next }) => {
	const response = await next();
	return new Response(response.body, {
		status: response.status,
		headers: {
			...Object.fromEntries(response.headers.entries()),
			"x-set-from-functions": "true",
		},
	});
};
