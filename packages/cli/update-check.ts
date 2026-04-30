import { fetchLatestNpmVersion } from "@cloudflare/workers-utils";
import type { NpmVersionCheckResult } from "@cloudflare/workers-utils";
const checks = new Map<string, Promise<NpmVersionCheckResult>>();
/** Checks the package registry once per package and version in this process. */
export function updateCheck(name: string, version: string): Promise<NpmVersionCheckResult> {
 const key = `${name}@${version}`;
 let result = checks.get(key);
 if (!result) { result = fetchLatestNpmVersion(name, version); checks.set(key,result); }
 return result;
}
