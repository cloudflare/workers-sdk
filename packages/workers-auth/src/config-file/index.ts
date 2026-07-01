/**
 * Pluggable persistence for a typed config blob.
 *
 */
export interface ConfigStorage<T> {
	/**
	 * Read and parse the stored config.
	 *
	 * Consumers can treat a `read()` that resolves with `undefined` as
	 * "not logged in / no temporary account / etc.", and leave error handling
	 * for the surfaces that benefit from it.
	 *
	 * @returns `undefined` for the *empty* state — i.e. when the
	 * backing store does not exist yet, or when it exists but no longer
	 * contains usable data (e.g. encrypted-file present but the keyring entry
	 * is missing, ciphertext fails its auth tag, deserialised payload is not
	 * shaped like `T`). All of these collapse to "nothing usable stored
	 * here" from the consumer's perspective, so the default is to return
	 * `undefined` rather than throw.
	 *
	 * @throws  *genuine* errors that the consumer needs to act on — typically
	 * filesystem or permission failures (`EACCES`, `EISDIR`, disk full).
	 * Those propagate so the user can see what's wrong, rather than silently
	 * behaving as "not logged in".
	 */
	read(): T | undefined;
	/** Serialize and persist the config. */
	write(config: T): void;
	/** Remove the backing store; returns whether anything existed beforehand. */
	clear(): boolean;
	/** Human-readable location of the backing store, for display and warnings. */
	path(): string;
}
