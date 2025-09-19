// Worker names
export const ROUTER_WORKER_NAME = "__router-worker__";
export const ASSET_WORKER_NAME = "__asset-worker__";
export const VITE_PROXY_WORKER_NAME = "__vite_proxy_worker__";

// virtual modules
export const virtualPrefix = "virtual:cloudflare/";
export const VIRTUAL_USER_ENTRY = `${virtualPrefix}user-entry`;
export const VIRTUAL_NODEJS_COMPAT_ENTRY = `${virtualPrefix}nodejs-compat-entry`;

export const kRequestType = Symbol("kRequestType");

declare module "http" {
	interface IncomingMessage {
		[kRequestType]?: "asset";
	}
}
