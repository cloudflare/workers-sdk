// Respond to OPTIONS method
export const onRequestOptions: PagesFunction = async () => {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Max-Age': '86400',
		},
	});
};

// Set CORS to all /api responses
export const onRequest: PagesFunction = async ({ next }) => {
	const response = await next();
	response.headers.set('Access-Control-Allow-Origin', '*');
	response.headers.set('Access-Control-Max-Age', '86400');
	return response;
};
