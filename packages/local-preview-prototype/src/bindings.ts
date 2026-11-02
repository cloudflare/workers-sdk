import { createNodeBindings, fetch, ProxyClient } from "miniflare";
import type { PlatformProxyConnection } from "miniflare";

/**
 * Connects to a running preview server's bindings and default entrypoint,
 * from this process or another one. Uses the same implementation as
 * `Miniflare#getBindings()`, which now runs standalone given a connection.
 *
 * @param connection - From `PreviewServer#getBindingsConnection()`.
 * @returns The Worker's `env`, its default entrypoint, and a disposer.
 */
export function connectBindings<
	Env = Record<string, unknown>,
	Entrypoint = unknown,
>(connection: PlatformProxyConnection) {
	const client = new ProxyClient(
		new URL(connection.url),
		fetch,
		connection.secret
	);
	return {
		env: createNodeBindings<Env>(client, connection.bindings),
		entrypoint: client.env[connection.entrypoint] as Entrypoint,
		dispose: () => client.dispose(),
	};
}
