export const onRequest = async ({ request, passThroughOnException, next }) => {
	passThroughOnException();

	try {
		return await next();
	} catch (e) {
		if (new URL(request.url).searchParams.has("catch")) {
			return new Response(`Manually caught error: ${e}`);
		}

		throw e;
	}
};
