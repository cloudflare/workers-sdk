import type { CompatDate } from "./compatibility-date";

/**
 * The compatibility date to use when the user has not specified one.
 *
 * This is the release date of the `workerd` version pinned in the pnpm catalog,
 * so it is fixed for a given release of workers-sdk and updated whenever
 * `workerd` is upgraded.
 *
 * It deliberately tracks `workerd` rather than the current date, because
 * workerd rejects a compatibility date later than either of:
 *
 * - its `MAXIMUM_COMPATIBILITY_DATE`, which is its release date plus 7 days, or
 * - today's date (UTC).
 *
 * Run `pnpm update:compat-date` to refresh this value; `pnpm check:compat-date`
 * asserts that it matches the pinned `workerd` version.
 *
 * @see https://github.com/cloudflare/workerd/blob/main/src/workerd/io/BUILD.bazel
 * @see https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.c%2B%2B
 */
export const DEFAULT_COMPAT_DATE: CompatDate = "2026-08-25";
