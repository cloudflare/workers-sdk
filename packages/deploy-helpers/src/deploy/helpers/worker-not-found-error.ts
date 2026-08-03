/**
 This is the error code from the Cloudflare API signaling that a worker could not be found on the target account
 */
export const WORKER_NOT_FOUND_ERR_CODE = 10007 as const;

/**
 This is the error code from the Cloudflare API signaling that a worker environment (legacy) could not be found on the target account
 */
export const WORKER_LEGACY_ENVIRONMENT_NOT_FOUND_ERR_CODE = 10090 as const;

/**
 This is the error message from the Cloudflare API signaling that a worker could not be found on the target account
 */
export const workerNotFoundErrorMessage =
	"This Worker does not exist on your account.";

/**
 * Given an error from the Cloudflare API discerns whether it is caused by a worker that could not be found on the target account
 *
 * @param error The error object
 * @returns true if the object represents an error from the Cloudflare API caused by a not found worker, false otherwise
 */
export function isWorkerNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error.code === WORKER_NOT_FOUND_ERR_CODE ||
			error.code === WORKER_LEGACY_ENVIRONMENT_NOT_FOUND_ERR_CODE)
	);
}
