interface Env {
	fetcher: Fetcher;
}
class LocalDispatchNamespace implements DispatchNamespace {
	constructor(private env: Env) {}
	get(
		name: string,
		args?: { [key: string]: any },
		options?: DynamicDispatchOptions
	): Fetcher {
		return {
			...this.env.fetcher,
			fetch: (
				input: RequestInfo | URL,
				init?: RequestInit
			): Promise<Response> => {
				const request = new Request(input, init);
				request.headers.set(
					"MF-Dispatch-Namespace-Options",
					JSON.stringify({ name, args, options })
				);
				return this.env.fetcher.fetch(request);
			},
		};
	}
}

export default function (env: Env) {
	return new LocalDispatchNamespace(env);
}
