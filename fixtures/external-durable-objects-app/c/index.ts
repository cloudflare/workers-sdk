declare const SW_REFERENCED_DO: DurableObjectNamespace;

addEventListener("fetch", (event) => {
	const { pathname } = new URL(event.request.url);
	const id = SW_REFERENCED_DO.idFromName(pathname);
	const stub = SW_REFERENCED_DO.get(id);
	event.respondWith(stub.fetch(event.request));
});
