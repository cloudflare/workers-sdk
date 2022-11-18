export const onRequest = async ({ env, request }) => {
	return env.SERVICE.fetch(request);
};
