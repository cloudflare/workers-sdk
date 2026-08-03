/**
 * A small abstraction over OS keyring backends, scoped to "store/retrieve
 * an arbitrary fixed-size key" rather than "store a credential blob".
 *
 * Keeping the responsibility this narrow means:
 *   - The 2.5 KB macOS Keychain item limit (and similar limits elsewhere)
 *     is never hit — we only ever store ~44 bytes of base64.
 *   - Per-platform code stays trivial; richer credential shapes can grow
 *     freely inside the encrypted file without touching the keyring.
 *   - The same `KeyProvider` is reusable for non-OAuth secrets in the
 *     future (e.g. account-scoped API tokens).
 *
 * Implementations are instantiated with the consumer's `serviceName`
 * (e.g. "wrangler") so the same library can serve multiple Cloudflare
 * CLIs without collisions.
 */
export interface KeyProvider {
	/**
	 * Return the previously-stored key, or `undefined` when nothing has
	 * been stored for this `(serviceName, accountName)` pair. Backend
	 * failures throw so callers can surface meaningful errors.
	 */
	getKey(): Uint8Array | undefined;

	/** Persist the given key, overwriting any previous value. */
	setKey(key: Uint8Array): void;

	/** Remove the stored key. Idempotent — no-op when nothing is stored. */
	deleteKey(): void;

	/**
	 * Human-readable description of where the key is stored, surfaced via
	 * the {@link CredentialStore.describe} chain.
	 */
	describe(): string;
}
