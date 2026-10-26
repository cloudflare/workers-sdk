import assert from "node:assert";
import type { ProxyClient } from "./client";

/**
 * How a binding appears in Node.js: either a binding proxied from `workerd`,
 * or a plain value computed in Node.js (e.g. text and JSON vars).
 */
export type NodeBindingDescriptor =
	| { proxy: string; handler?: ProxyHandler<any> }
	| { value: unknown };

/**
 * Everything another process needs to reach a Worker's bindings and default
 * entrypoint through a runtime's platform proxy. JSON-serializable. Contains
 * the proxy secret, so treat it as a credential.
 */
export interface PlatformProxyConnection {
	/** URL of the runtime's entry socket. */
	url: string;
	/** Hex-encoded platform proxy secret. */
	secret: string;
	/** The Worker's bindings, keyed by binding name. */
	bindings: Record<string, NodeBindingDescriptor>;
	/** Proxy binding name of the Worker's default entrypoint. */
	entrypoint: string;
}

/**
 * Builds a Worker's `env` from binding descriptors using a proxy client.
 * `Miniflare#getBindings()` uses this, and it can also be called with a
 * `ProxyClient` connected to a runtime started by another process.
 *
 * @param proxyClient Client connected to the runtime's platform proxy.
 * @param descriptors The Worker's bindings, keyed by binding name.
 * @returns The Worker's `env`.
 */
export function createNodeBindings<Env = Record<string, unknown>>(
	proxyClient: ProxyClient,
	descriptors: Record<string, NodeBindingDescriptor>
): Env {
	const bindings: Record<string, unknown> = {};
	for (const [name, descriptor] of Object.entries(descriptors)) {
		// Check for `proxy`: a `{ value: undefined }` descriptor loses its key in JSON
		if (!("proxy" in descriptor)) {
			bindings[name] = descriptor.value;
			continue;
		}
		let proxy = proxyClient.env[descriptor.proxy];
		assert(proxy !== undefined, `Expected ${descriptor.proxy} to be bound`);
		if (descriptor.handler) {
			proxy = new Proxy(proxy as object, descriptor.handler);
		}
		bindings[name] = proxy;
	}
	return bindings as Env;
}
