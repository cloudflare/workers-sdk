export default {
	fetch(request: Request, env: { REFERENCED_DO: DurableObjectNamespace }) {
		const { pathname } = new URL(request.url);
		const id = env.REFERENCED_DO.idFromName(pathname);
		const stub = env.REFERENCED_DO.get(id);
		return stub.fetch(request);
	},
};
