/** The subset of a bundler's logger that shared dev code writes to. */
export interface DevLogger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string, options?: { error?: Error | null }): void;
}
