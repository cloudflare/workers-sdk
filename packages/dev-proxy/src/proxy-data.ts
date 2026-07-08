import type { UrlOriginAndPathnameParts, UrlOriginParts } from "./url";

export type ProxyData = {
	userWorkerUrl: UrlOriginParts;
	userWorkerInspectorUrl?: UrlOriginAndPathnameParts;
	userWorkerInnerUrlOverrides?: Partial<UrlOriginParts>;
	headers: Record<string, string>;
	liveReload?: boolean;
	proxyLogsToController?: boolean;
};

/**
 * How long to wait before proactively refreshing an edge-preview token.
 * Preview tokens expire after 1 hour; refreshing at 50 minutes leaves headroom
 * so an in-flight request never races the expiry. Shared by `wrangler dev
 * --remote` and `@cloudflare/remote-bindings`.
 */
export const PREVIEW_TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

/** An edge-preview token: the host to talk to and the value to authenticate with. */
export interface RemotePreviewToken {
	/** The host where the preview is served (e.g. `foo.workers.dev`). */
	host: string;
	/** The `cf-workers-preview-token` header value. */
	value: string;
}

/**
 * Build the {@link ProxyData} that points the shared ProxyWorker at a remote
 * edge preview: HTTPS to the token's host on 443, injecting the preview token
 * (plus any Cloudflare Access headers) on every forwarded request.
 *
 * This is the single definition of the remote-mode proxy configuration, shared
 * by `wrangler dev --remote` (RemoteRuntimeController) and
 * `@cloudflare/remote-bindings`, so both drive the ProxyWorker identically.
 *
 * `accessHeaders` is resolved by the caller (via `getAccessHeaders`) so each
 * consumer can inject its own logger/interactivity behaviour.
 */
export function createRemoteModeProxyData(
	token: RemotePreviewToken,
	accessHeaders: Record<string, string>,
	options: { liveReload?: boolean } = {}
): ProxyData {
	return {
		userWorkerUrl: {
			protocol: "https:",
			hostname: token.host,
			port: "443",
		},
		headers: {
			"cf-workers-preview-token": token.value,
			...accessHeaders,
			"cf-connecting-ip": "",
		},
		liveReload: options.liveReload,
		proxyLogsToController: true,
	};
}

// Messages sent from the controller (Node) into the ProxyWorker.
export type ProxyWorkerIncomingRequestBody =
	| { type: "play"; proxyData: ProxyData }
	| { type: "pause" };

// Messages sent from the ProxyWorker back out to the controller (Node).
export type ProxyWorkerOutgoingRequestBody =
	| { type: "error"; error: SerializedError }
	| { type: "sseResponseDetected" }
	| { type: "previewTokenExpired"; proxyData: ProxyData }
	| { type: "debug-log"; args: Parameters<typeof console.debug> };

export type SerializedError = {
	message: string;
	name?: string;
	stack?: string | undefined;
	cause?: unknown;
};

export function serialiseError(e: unknown): SerializedError {
	if (e instanceof Error) {
		return {
			message: e.message,
			name: e.name,
			stack: e.stack,
			cause: e.cause && serialiseError(e.cause),
		};
	} else {
		return { message: String(e) };
	}
}
