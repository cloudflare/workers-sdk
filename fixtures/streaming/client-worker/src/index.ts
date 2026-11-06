interface Env {
	WORKER: Fetcher;
}

export default {
	fetch(request: Request, env: Env): Promise<Response> {
		return env.WORKER.fetch(request);
	},
};
