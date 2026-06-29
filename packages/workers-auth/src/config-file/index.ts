/**
 * Pluggable persistence for a typed config blob.
 *
 * ## `read()` contract
 *
 * `read()` returns `undefined` for the *empty* state — i.e. when the
 * backing store does not exist yet, or when it exists but no longer
 * contains usable data (e.g. encrypted-file present but the keyring entry
 * is missing, ciphertext fails its auth tag, deserialised payload is not
 * shaped like `T`). All of these collapse to "nothing usable stored
 * here" from the consumer's perspective, so the default is to return
 * `undefined` rather than throw.
 *
 * `read()` should `throw` for *genuine* errors that the consumer needs to
 * act on — typically filesystem or permission failures (`EACCES`,
 * `EISDIR`, disk full). Those propagate so the user can see what's wrong,
 * rather than silently behaving as "not logged in".
 *
 * Sanctioned exception to "unusable ⇒ undefined": an implementation that
 * backs a *user-inspectable, hand-editable* store MAY also throw on
 * unparseable content, to surface corruption the user can fix.
 * `@cloudflare/workers-auth`'s plaintext `FileCredentialStore` does this
 * deliberately (and tests it); the encrypted store and the generic
 * `createTomlFileStorage` TOML caches treat corruption as `undefined`.
 *
 * Consumers can therefore treat a `read()` that resolves with
 * `undefined` as "not logged in / no temporary account / etc.", and
 * leave error handling for the surfaces that benefit from it.
 */
export interface ConfigStorage<T> {
	/**
	 * Read and parse the stored config. Returns `undefined` when no usable
	 * config is stored (missing, empty, or unrecoverable). Throws for
	 * genuine errors; a few user-inspectable implementations additionally
	 * throw on corruption — see the interface docs.
	 */
	read(): T | undefined;
	/** Serialize and persist the config. */
	write(config: T): void;
	/** Remove the backing store; returns whether anything existed beforehand. */
	clear(): boolean;
	/** Human-readable location of the backing store, for display and warnings. */
	path(): string;
}
