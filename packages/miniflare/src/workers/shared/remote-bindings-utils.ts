import { newWebSocketRpcSession } from "capnweb";
import type { SharedBindings } from "./constants";

/**
 * Common environment type for remote binding workers.
 */
export type RemoteBindingEnv = {
	remoteProxyConnectionString?: string;
	binding: string;
	cfTraceId?: string;
	// Optional loopback service used to surface diagnostics back to the
	// Miniflare host (e.g. a Cloudflare Access block detected on the response
	// from the remote-bindings proxy server).
	[SharedBindings.MAYBE_SERVICE_LOOPBACK]?: Fetcher;
};

/** Headers sent alongside proxy requests to provide additional context. */
export type ProxyMetadata = {
	"MF-Dispatch-Namespace-Options"?: string;
};

/**
 * Throws a consistent error when a binding requires remote mode but isn't configured for it.
 */
export function throwRemoteRequired(bindingName: string): never {
	throw new Error(`Binding ${bindingName} needs to be run remotely`);
}

/**
 * If the response from the remote-bindings proxy server is a Cloudflare Access
 * block page, report it to the Miniflare host via the loopback service so that
 * a single, actionable warning can be surfaced to the user.
 *
 * The remote-bindings proxy CLIENT worker only ever calls the
 * `remoteProxyConnectionString`, so a 403 with a Cloudflare Access body here
 * is unambiguously an Access block — never a user-worker 403.
 *
 * Dedup is performed on the Miniflare/Node side; the worker fires-and-forgets.
 */
async function maybeReportCloudflareAccessBlock(
	response: Response,
	bindingName: string,
	proxyUrl: string,
	loopback: Fetcher | undefined
): Promise<void> {
	if (!loopback || response.status !== 403) {
		return;
	}
	let text: string;
	try {
		text = await response.clone().text();
	} catch {
		return;
	}
	// Cloudflare Access block pages reliably contain the literal string
	// "Cloudflare Access" in the HTML body (title: "Error ・ Cloudflare Access").
	// Combined with the 403 status and the fact that this worker only ever
	// calls the remote-bindings proxy URL, this is a low-false-positive signal.
	if (!text.includes("Cloudflare Access")) {
		return;
	}
	await loopback.fetch("http://localhost/core/remote-bindings-access-warning", {
		method: "POST",
		headers: {
			"MF-Binding": bindingName,
			"MF-Proxy-URL": proxyUrl,
		},
	});
}

export function makeFetch(
	remoteProxyConnectionString: string | undefined,
	bindingName: string,
	extraHeaders?: Headers,
	cfTraceId?: string,
	loopback?: Fetcher
) {
	return async (
		input: RequestInfo | URL,
		init?: RequestInit
	): Promise<Response> => {
		if (!remoteProxyConnectionString) {
			throwRemoteRequired(bindingName);
		}
		const request = new Request(input, init);

		const proxiedHeaders = new Headers(extraHeaders);
		for (const [name, value] of request.headers) {
			// The `Upgrade` header needs to be special-cased to prevent:
			//   TypeError: Worker tried to return a WebSocket in a response to a request which did not contain the header "Upgrade: websocket"
			if (name === "upgrade") {
				proxiedHeaders.set(name, value);
			} else {
				proxiedHeaders.set(`MF-Header-${name}`, value);
			}
		}
		proxiedHeaders.set("MF-URL", request.url);
		proxiedHeaders.set("MF-Binding", bindingName);
		if (cfTraceId) {
			// Set directly on the outgoing request so Cloudflare's edge tracing picks it up
			proxiedHeaders.set("cf-trace-id", cfTraceId);
			// Also forward through to the binding call via the MF-Header proxy mechanism
			proxiedHeaders.set("MF-Header-cf-trace-id", cfTraceId);
		}
		const req = new Request(request, {
			headers: proxiedHeaders,
		});

		const response = await fetch(remoteProxyConnectionString, req);
		// Awaited (rather than fire-and-forget) so the loopback POST isn't
		// cancelled when the proxy client returns. The happy path
		// (non-403) short-circuits before any body read or loopback call,
		// so this adds no latency to successful requests.
		await maybeReportCloudflareAccessBlock(
			response,
			bindingName,
			remoteProxyConnectionString,
			loopback
		);
		return response;
	};
}

/**
 * Create a remote proxy stub that proxies to a remote binding via capnweb.
 *
 * Intercepts `.fetch()` to use plain HTTP; forwards other accesses to capnweb.
 */
export function makeRemoteProxyStub(
	remoteProxyConnectionString: string,
	bindingName: string,
	metadata?: ProxyMetadata,
	cfTraceId?: string,
	loopback?: Fetcher
): Fetcher {
	const url = new URL(remoteProxyConnectionString);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("MF-Binding", bindingName);
	if (metadata) {
		for (const [key, value] of Object.entries(metadata)) {
			if (value !== undefined) {
				url.searchParams.set(key, value);
			}
		}
	}

	type ProxiedService = Omit<Service, "connect" | "fetch"> & {
		fetch: typeof fetch;
		connect: never;
	};
	const stub = newWebSocketRpcSession(url.href) as unknown as ProxiedService;

	const headers = metadata
		? new Headers(
				Object.entries(metadata).filter(
					(entry): entry is [string, string] => entry[1] !== undefined
				)
			)
		: undefined;

	return new Proxy<ProxiedService>(stub, {
		get(_, p) {
			if (p === "fetch") {
				return makeFetch(
					remoteProxyConnectionString,
					bindingName,
					headers,
					cfTraceId,
					loopback
				);
			}
			return Reflect.get(stub, p);
		},
	});
}
