export interface ViteProxyWorkerFetchTarget {
	fetch(request: Request): Promise<Response> | Response;
}

export interface ViteProxyWorkerFetchEnvLike {
	ENTRY_USER_WORKER: ViteProxyWorkerFetchTarget;
	__VITE_MIDDLEWARE__: ViteProxyWorkerFetchTarget;
}

export function isWebSocketUpgrade(request: Request): boolean {
	return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

export function fetchThroughViteProxyWorker(
	request: Request,
	env: ViteProxyWorkerFetchEnvLike
): Promise<Response> | Response {
	if (isWebSocketUpgrade(request)) {
		return env.ENTRY_USER_WORKER.fetch(request);
	}

	return env.__VITE_MIDDLEWARE__.fetch(request);
}
