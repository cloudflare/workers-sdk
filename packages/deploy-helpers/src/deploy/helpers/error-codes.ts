/**
 * Cloudflare API error codes used by deploy-helpers.
 */

/** The inherit binding references a binding that does not exist on the previous version. */
export const INVALID_INHERIT_BINDING_CODE = 10057 as const;

/**
 * Blocking-error code for declarative DO exports reconciliation failures.
 * Used to distinguish the reconciliation error envelope from other 4xx upload
 * errors so we can render the structured per-class details.
 */
export const EXPORTS_RECONCILIATION_ERROR_CODE = 100402;
