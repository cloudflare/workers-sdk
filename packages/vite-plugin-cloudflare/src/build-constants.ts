import type { CompatDate } from "@cloudflare/workers-utils";

declare const __VITE_PLUGIN_DEFAULT_COMPAT_DATE__: CompatDate;

/**
 * The default compatibility date to use when the user omits one.
 * This value is injected at build time and remains fixed for each release.
 */
export const DEFAULT_COMPAT_DATE = __VITE_PLUGIN_DEFAULT_COMPAT_DATE__;
