import { randomUUID } from "node:crypto";

// Worker names
export const ROUTER_WORKER_NAME = "__router-worker__";
export const ASSET_WORKER_NAME = "__asset-worker__";
export const VITE_PROXY_WORKER_NAME = "__vite_proxy_worker__";

export const PROXY_SHARED_SECRET = randomUUID();

/** The CLI named in actionable messages. The plugin is only compatible with `cf`. */
export const CLI_DISPLAY_NAME = "cf";

export const kRequestType = Symbol("kRequestType");

declare module "http" {
	interface IncomingMessage {
		[kRequestType]?: "asset";
	}
}
