/**
 * Wrapped binding extension for dispatch namespaces.
 *
 * Delegates to {@link DispatchNamespaceProxy} via a service binding.
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
