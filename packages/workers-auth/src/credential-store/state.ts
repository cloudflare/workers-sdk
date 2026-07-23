/**
 * Per-session memoization flags used by the resolver to ensure warnings
 * fire once and the Windows lazy-install isn't retried after a failure.
 *
 * The credential-storage configuration itself (`serviceName`,
 * `isKeyringEnabled`, etc.) is captured per-consumer by
 * {@link createCredentialStorageContext} in `./resolver.ts`. Only the
 * "did we warn already?" / "did the install fail this session?" latches
 * live at module scope, because they're inherently per-process.
 */
export interface ResolverSessionFlags {
	installFailedThisSession: boolean;
	hasWarnedAboutKeyringFallback: boolean;
	hasWarnedAboutSecretToolMissing: boolean;
}

const sessionFlags: ResolverSessionFlags = {
	installFailedThisSession: false,
	hasWarnedAboutKeyringFallback: false,
	hasWarnedAboutSecretToolMissing: false,
};

/** Mutable view onto the per-session resolver flags. */
export function getResolverSessionFlags(): ResolverSessionFlags {
	return sessionFlags;
}

/**
 * Reset module-level per-session resolver flags (memoized warnings, the
 * Windows install-failed latch).
 *
 * Tests use this to start each case from a clean slate. In production
 * the flags reset naturally when the wrangler process exits.
 */
export function resetCredentialStorageState(): void {
	sessionFlags.installFailedThisSession = false;
	sessionFlags.hasWarnedAboutKeyringFallback = false;
	sessionFlags.hasWarnedAboutSecretToolMissing = false;
}

/**
 * Alias kept for tests that previously called this to fully tear down
 * both the configuration and the session flags. With the per-consumer
 * configuration captured in `createCredentialStorageContext`, this now
 * does the same thing as {@link resetCredentialStorageState}: clear the
 * session flags.
 */
export const clearCredentialStorageState = resetCredentialStorageState;
