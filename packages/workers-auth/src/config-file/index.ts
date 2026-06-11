/**
 * Pluggable persistence for a typed config blob
 */
export interface ConfigStorage<T> {
	/**
	 * Read and parse the stored config.
	 * @throws if the backing store is missing or cannot be parsed.
	 */
	read(): T;
	/** Serialize and persist the config. */
	write(config: T): void;
	/** Remove the backing store; returns whether anything existed beforehand. */
	clear(): boolean;
	/** Human-readable location of the backing store, for display and warnings. */
	path(): string;
}
