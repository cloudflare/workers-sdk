/**
 * Thin wrapped binding extension for dispatch namespaces.
 *
 * Runs inside the user's worker isolate. Provides a genuinely synchronous
 * .get() that delegates to the dispatch namespace proxy client worker
 * via a service binding. The proxy client (separate worker) owns the
 * capnweb connection.
 */

interface Env {
	proxyClient: DispatchNamespace;
}

export default function (env: Env): DispatchNamespace {
	return {
		get(
			name: string,
			args?: { [key: string]: unknown },
			options?: DynamicDispatchOptions
		): Fetcher {
			return env.proxyClient.get(name, args, options);
		},
	} satisfies DispatchNamespace;
}
