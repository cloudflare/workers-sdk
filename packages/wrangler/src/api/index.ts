import { initApiDeployHelpersContext } from "./deploy-helpers-context";

initApiDeployHelpersContext();

export { unstable_dev } from "./dev";
export type { Unstable_DevWorker, Unstable_DevOptions } from "./dev";
export { unstable_pages } from "./pages";
export { generateTypes as experimental_generateTypes } from "./generate-types";
export type {
	Experimental_GenerateTypesOptions,
	Experimental_GenerateTypesResult,
} from "./generate-types";
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
export { convertConfigBindingsToStartWorkerBindings } from "./startDevWorker/config-binding-utils";
export { WranglerDevEnv as DevEnv } from "./startDevWorker/WranglerDevEnv";
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
} from "@cloudflare/remote-bindings/internal";
export {
	castErrorCause,
	serialiseError,
} from "@cloudflare/remote-bindings/internal";
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
} from "@cloudflare/remote-bindings/internal";
export type { DevToolsEvent } from "@cloudflare/remote-bindings/internal";

// Exports from ./server
export { createTestHarness } from "./test-harness";
export type {
	TestHarnessOptions,
	WorkerHandle,
	TestHarness,
} from "./test-harness";

// Exports from ./integrations
export {
	unstable_getVarsForDev,
	unstable_readConfig,
	unstable_getDurableObjectClassNameToUseSQLiteMap,
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- re-exporting deprecated public API for backward compatibility
	unstable_getDevCompatibilityDate,
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

// Exports from ./remote-bindings
export {
	startRemoteProxySession,
	pickRemoteBindings,
	maybeStartOrUpdateRemoteProxySession,
} from "./remote-bindings";
export type {
	StartRemoteProxySessionOptions,
	RemoteProxySession,
} from "./remote-bindings";
