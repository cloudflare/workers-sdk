export const WORKER_NAME_PREFIX = "vitest-pool-workers:";

export function isFileNotFoundError(e: unknown): boolean {
	return (
		typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT"
	);
}
