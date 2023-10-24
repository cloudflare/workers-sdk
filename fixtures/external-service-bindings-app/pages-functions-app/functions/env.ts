export const onRequest = async ({ env, request }) => {
	const getTextFrom = (fetcher: Fetcher) =>
		fetcher.fetch(request).then((resp) => resp.text());

	return Response.json({
		moduleWorkerCResponse: await getTextFrom(env.STAGING_MODULE_C_SERVICE),
		moduleWorkerDResponse: await getTextFrom(env.STAGING_MODULE_D_SERVICE),
	});
};
