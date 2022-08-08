export const onRequest = async ({ env, request }) => {
	const { pathname } = new URL(request.url);
	const id = env.PAGES_REFERENCED_DO.idFromName(pathname);
	const stub = env.PAGES_REFERENCED_DO.get(id);
	return stub.fetch(request);
};
