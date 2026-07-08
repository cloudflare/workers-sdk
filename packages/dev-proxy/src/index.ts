// The pure protocol layer (types, control messages, helpers). Safe everywhere.
export * from "./protocol";
// The miniflare-backed harness. Node-only: importing it pulls in miniflare, so
// worker bundles must import from `@cloudflare/dev-proxy/protocol` instead.
export {
	createProxyWorkerOptions,
	proxyWorkerScript,
	sendProxyWorkerMessage,
} from "./harness";
export type { ProxyWorkerHarnessOptions } from "./harness";
