// The pure protocol layer: types, the ProxyWorker control-message shapes, and
// small helpers with NO dependency on miniflare or the bundled worker script.
//
// This is safe to bundle into a workerd worker (e.g. wrangler's
// InspectorProxyWorker, which imports wrangler's re-export shims). The
// miniflare-dependent harness lives in the package's main entry point instead,
// so importing it here can never drag `node:*`/miniflare into a worker bundle.
export { createDeferred } from "./deferred";
export type { DeferredPromise, MaybePromise } from "./deferred";
export { urlFromParts } from "./url";
export type { UrlOriginParts, UrlOriginAndPathnameParts } from "./url";
export {
	createRemoteModeProxyData,
	PREVIEW_TOKEN_REFRESH_INTERVAL,
	serialiseError,
} from "./proxy-data";
export type {
	ProxyData,
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
	RemotePreviewToken,
	SerializedError,
} from "./proxy-data";
