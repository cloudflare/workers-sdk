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

/**
 * Blocking-error code returned by EWC when a multi-version (percentage-split)
 * deployment contains versions with divergent declarative DO `exports`. All
 * versions in a percentage-split deploy must agree on the end-state, otherwise
 * traffic on one branch could route to code referencing unprovisioned (or
 * just-deleted) DO namespaces. Single-version (100%) deploys are unaffected.
 * Resolution: deploy the version that changes `exports` at 100% first, then
 * run the percentage-split deploy.
 */
export const INCONSISTENT_EXPORTS_ACROSS_VERSIONS_CODE = 100405;

/**
 * Blocking-error code returned by EWC when a `wrangler versions upload` payload
 * contains an actor binding (`durable_objects.bindings`) that references a
 * Durable Object class declared in `exports` but not yet provisioned.
 * Declarative `exports` reconcile when the version is *deployed*, so the
 * namespace must exist before a binding can reference it. This is the
 * exports-aware sibling of `ErrActorBindingDependsOnMigration` (10123) that
 * already exists for the legacy `migrations` flow.
 * Resolution: stage the new class via `ctx.exports.<ClassName>` (no binding)
 * on `versions upload` and add the binding at deploy time, or use
 * `wrangler deploy` to provision and bind in one step.
 */
export const ACTOR_BINDING_DEPENDS_ON_EXPORT_CODE = 100406;
