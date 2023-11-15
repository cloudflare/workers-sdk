export const onRequest = async ({ env, request }) => {
	const getTextFrom = (fetcher: Fetcher) =>
		fetcher.fetch(request).then((resp) => resp.text());

	return Response.json({
		moduleWorkerAResponse: await getTextFrom(env.MODULE_A_SERVICE),
		moduleWorkerBResponse: await getTextFrom(env.MODULE_B_SERVICE),
		serviceWorkerAResponse: await getTextFrom(env.SERVICE_A_SERVICE),
	});
};
