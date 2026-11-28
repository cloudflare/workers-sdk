export const D1_LOCAL_ENTRY_SERVICE_NAME = "d1:db:entry";
// The Worker running workerd's D1 (the bundled module `/workerd/d1.js`),
// reached with props `{ database }`.
export const D1_WORKERD_SERVICE_NAME = "d1:workerd";

export const D1Bindings = {
	DEBUG_PORT: "MINIFLARE_DEBUG_PORT",
} as const;
