import { initUndiciDispatcher } from "../shared/undici-dispatcher";

// When wrangler is imported as a library (e.g. by vitest-pool-workers),
// the CLI entry point doesn't run. Ensure undici respects NODE_EXTRA_CA_CERTS
// and proxy env vars.
initUndiciDispatcher();

export { unstable_dev } from "./dev";
export type { Unstable_DevWorker, Unstable_DevOptions } from "./dev";
export { unstable_pages } from "./pages";
export {
	uploadMTlsCertificate,
	uploadMTlsCertificateFromFs,
	listMTlsCertificates,
	getMTlsCertificate,
	getMTlsCertificateByName,
	deleteMTlsCertificate,
	uploadCaCertificateFromFs,
} from "./mtls-certificate";

// Exports from ./startDevWorker
export { convertConfigBindingsToStartWorkerBindings } from "./startDevWorker/utils";
export { DevEnv } from "./startDevWorker/DevEnv";
export { startWorker } from "./startDevWorker";
export type {
	Worker,
	StartDevWorkerInput,
	StartDevWorkerOptions,
	HookValues,
	Hook,
	AsyncHook,
	Bundle,
	LogLevel,
	File,
	BinaryFile,
	Trigger,
	Binding,
	ServiceFetch,
} from "./startDevWorker/types";
export { castErrorCause, serialiseError } from "./startDevWorker/events";
export type {
	ErrorEvent,
	ConfigUpdateEvent,
	BundleStartEvent,
	BundleCompleteEvent,
	ReloadStartEvent,
	ReloadCompleteEvent,
	DevRegistryUpdateEvent,
	PreviewTokenExpiredEvent,
	ReadyEvent,
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
	InspectorProxyWorkerIncomingWebSocketMessage,
	InspectorProxyWorkerOutgoingWebsocketMessage,
	InspectorProxyWorkerOutgoingRequestBody,
	SerializedError,
	UrlOriginParts,
	UrlOriginAndPathnameParts,
	ProxyData,
} from "./startDevWorker/events";
export type { DevToolsEvent } from "./startDevWorker/devtools";

// Exports from ./integrations
export {
	unstable_getVarsForDev,
	unstable_readConfig,
	unstable_getDurableObjectClassNameToUseSQLiteMap,
	unstable_getDevCompatibilityDate,
	unstable_getWorkerNameFromProject,
	getPlatformProxy,
	unstable_getMiniflareWorkerOptions,
} from "./integrations";
export type {
	Unstable_Config,
	Unstable_RawConfig,
	Unstable_RawEnvironment,
	GetPlatformProxyOptions,
	PlatformProxy,
	SourcelessWorkerOptions,
	Unstable_MiniflareWorkerOptions,
} from "./integrations";

// Exports from ./remoteBindings
export {
	startRemoteProxySession,
	pickRemoteBindings,
	maybeStartOrUpdateRemoteProxySession,
} from "./remoteBindings";
export type {
	StartRemoteProxySessionOptions,
	RemoteProxySession,
} from "./remoteBindings";
