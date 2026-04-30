import { DEFAULT_COMPAT_DATE } from "@cloudflare/workers-utils";
/** Returns the release date of the workerd version supported by this release. */
export function getWorkerdCompatibilityDate(_projectPath?: string) {
 return DEFAULT_COMPAT_DATE;
}
